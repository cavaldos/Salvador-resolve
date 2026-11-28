use std::{
    borrow::Cow,
    ffi::OsStr,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use tauri::{
    Manager, State, WebviewWindow, async_runtime,
    ipc::{InvokeBody, Request},
};
use tauri_plugin_dialog::DialogExt;
use tempfile::NamedTempFile;
use uuid::Uuid;

const MAX_CHUNK: usize = 1024 * 1024;
const MAX_EXPORT: u64 = 8 * 1024 * 1024 * 1024;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Container {
    Mp4,
    Webm,
    Png,
}

impl Container {
    fn for_name(name: &str) -> Option<Self> {
        let ext = Path::new(name).extension()?.to_str()?;
        if ext.eq_ignore_ascii_case("mp4") {
            Some(Self::Mp4)
        } else if ext.eq_ignore_ascii_case("webm") {
            Some(Self::Webm)
        } else if ext.eq_ignore_ascii_case("png") {
            Some(Self::Png)
        } else {
            None
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::Webm => "webm",
            Self::Png => "png",
        }
    }
}

pub struct ExportJob {
    id: Uuid,
    destination: PathBuf,
    container: Container,
    staging: NamedTempFile,
    expected: u64,
    written: u64,
}

impl ExportJob {
    fn new(destination: PathBuf, container: Container, expected: u64) -> io::Result<Self> {
        let staging = NamedTempFile::new_in(parent(&destination)?)?;
        Ok(Self {
            id: Uuid::new_v4(),
            destination,
            container,
            staging,
            expected,
            written: 0,
        })
    }

    fn write(&mut self, bytes: &[u8]) -> io::Result<()> {
        if bytes.is_empty()
            || bytes.len() > MAX_CHUNK
            || bytes.len() as u64 > self.expected - self.written
        {
            return Err(io::Error::other("Invalid export chunk size."));
        }
        self.staging.write_all(bytes)?;
        self.written += bytes.len() as u64;
        Ok(())
    }

    fn finish(self, ffmpeg: Option<&Path>) -> io::Result<&'static str> {
        if self.written != self.expected {
            return Err(io::Error::other("The export did not finish transferring."));
        }
        if self.container == Container::Png {
            let mut signature = [0; 8];
            self.staging.reopen()?.read_exact(&mut signature)?;
            if signature != *b"\x89PNG\r\n\x1a\n" {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Invalid PNG signature.",
                ));
            }
        }
        let (file, status) = match ffmpeg.filter(|_| self.container != Container::Png) {
            Some(bin) => match self.remux(bin) {
                Ok(remuxed) => (remuxed, "remuxed"),
                Err(_) => (self.staging, "remux-failed"),
            },
            None => (self.staging, "original"),
        };
        file.as_file().sync_all()?;
        file.persist(self.destination)
            .map_err(|error| error.error)?;
        Ok(status)
    }

    fn remux(&self, bin: &Path) -> io::Result<NamedTempFile> {
        let output = NamedTempFile::new_in(parent(&self.destination)?)?;
        let mut command = Command::new(bin);
        command.args([
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-protocol_whitelist",
            "file",
        ]);
        match self.container {
            Container::Mp4 => {
                command.args(["-f", "mov", "-enable_drefs", "0", "-use_absolute_path", "0"])
            }
            Container::Webm => command.args(["-f", "matroska"]),
            Container::Png => return Err(io::Error::other("Only video can be remuxed.")),
        };
        command
            .arg("-i")
            .arg(self.staging.path())
            .args(["-map", "0:v:0", "-map", "0:a:0?", "-c", "copy"]);
        if self.container == Container::Mp4 {
            command.args(["-movflags", "+faststart"]);
        }
        let mut process = command
            .args(["-f", self.container.extension()])
            .arg(output.path())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        let deadline = Instant::now() + Duration::from_secs(120);
        loop {
            match process.try_wait() {
                Ok(Some(status)) => {
                    if status.success() && output.as_file().metadata()?.len() > 0 {
                        return Ok(output);
                    }
                    return Err(io::Error::other("FFmpeg could not remux the export."));
                }
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(50))
                }
                _ => {
                    let _ = process.kill();
                    let _ = process.wait();
                    return Err(io::Error::other("FFmpeg did not finish."));
                }
            }
        }
    }
}

fn parent(path: &Path) -> io::Result<&Path> {
    path.parent()
        .filter(|dir| path.is_absolute() && !dir.as_os_str().is_empty())
        .ok_or_else(|| io::Error::other("Select a local folder to save the export."))
}

fn native_ffmpeg() -> Option<PathBuf> {
    // Never receive an executable path or arguments from the webview, and don't search PATH.
    #[cfg(target_os = "macos")]
    let paths = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
    #[cfg(target_os = "linux")]
    let paths = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let paths: [&str; 0] = [];
    paths
        .into_iter()
        .map(PathBuf::from)
        .find(|path| path.is_file())
}

pub type ExportState = async_runtime::Mutex<Option<ExportJob>>;

#[tauri::command]
pub async fn begin_export_save(
    window: WebviewWindow,
    state: State<'_, ExportState>,
    name: String,
    size: u64,
) -> Result<Option<String>, String> {
    if !(1..=MAX_EXPORT).contains(&size) {
        return Err("Desktop save supports non-empty exports up to 8 GiB.".into());
    }
    if name.len() > 255 || name.contains(['/', '\\', ':']) || name.chars().any(char::is_control) {
        return Err("Enter a valid export file name.".into());
    }
    let container =
        Container::for_name(&name).ok_or("Only MP4, WebM and PNG exports can be saved.")?;
    let mut slot = state
        .try_lock()
        .map_err(|_| "An export save is already in progress.")?;
    if slot.is_some() {
        return Err("An export save is already in progress.".into());
    }
    let (sender, mut receiver) = async_runtime::channel(1);
    let app = window.app_handle().clone();
    app.run_on_main_thread(move || {
        window
            .app_handle()
            .dialog()
            .file()
            .set_parent(&window)
            .set_file_name(name)
            .add_filter(container.extension(), &[container.extension()])
            .save_file(move |destination| {
                let _ = sender.try_send(destination);
            });
    })
    .map_err(|_| "Could not open the export save dialog.")?;
    let Some(destination) = receiver
        .recv()
        .await
        .ok_or("The export save dialog was interrupted.")?
    else {
        return Ok(None);
    };
    let destination = destination
        .into_path()
        .map_err(|_| "Select a local file.")?;
    if destination
        .extension()
        .and_then(OsStr::to_str)
        .is_none_or(|ext| !ext.eq_ignore_ascii_case(container.extension()))
    {
        return Err(format!(
            "Use the .{} extension for this export.",
            container.extension()
        ));
    }
    let job = async_runtime::spawn_blocking(move || ExportJob::new(destination, container, size))
        .await
        .map_err(|_| "Could not start the export save.")?
        .map_err(|error| {
            format!(
                "Cannot create an export in this folder: {:?}.",
                error.kind()
            )
        })?;
    let id = job.id.to_string();
    *slot = Some(job);
    Ok(Some(id))
}

fn matches(job: &ExportJob, id: &str) -> bool {
    Uuid::parse_str(id).is_ok_and(|id| id == job.id)
}

fn export_bytes(body: &InvokeBody) -> Result<Cow<'_, [u8]>, &'static str> {
    match body {
        InvokeBody::Raw(bytes) => Ok(Cow::Borrowed(bytes)),
        // Tauri falls back to postMessage with an array when custom-protocol IPC is unavailable.
        InvokeBody::Json(value) => {
            let bytes = value
                .as_array()
                .filter(|values| values.len() <= MAX_CHUNK)
                .ok_or("Expected a binary export chunk.")?;
            bytes
                .iter()
                .map(|byte| {
                    byte.as_u64()
                        .and_then(|byte| u8::try_from(byte).ok())
                        .ok_or("Invalid export byte.")
                })
                .collect::<Result<Vec<_>, _>>()
                .map(Cow::Owned)
        }
    }
}

#[tauri::command]
pub async fn write_export_chunk(
    state: State<'_, ExportState>,
    request: Request<'_>,
) -> Result<(), String> {
    let id = request
        .headers()
        .get("salvador-export-id")
        .and_then(|id| id.to_str().ok())
        .ok_or("Missing export ID.")?;
    let bytes = export_bytes(request.body())?;
    let mut slot = state.lock().await;
    let job = slot
        .as_mut()
        .filter(|job| matches(job, id))
        .ok_or("This export save is no longer active.")?;
    if let Err(error) = job.write(&bytes) {
        *slot = None;
        return Err(format!("Cannot write the export: {:?}.", error.kind()));
    }
    Ok(())
}

#[tauri::command]
pub async fn finish_export_save(
    state: State<'_, ExportState>,
    id: String,
) -> Result<&'static str, String> {
    let mut slot = state.lock().await;
    if !slot.as_ref().is_some_and(|job| matches(job, &id)) {
        return Err("This export save is no longer active.".into());
    }
    let job = slot.take().ok_or("This export save is no longer active.")?;
    let result = async_runtime::spawn_blocking(move || job.finish(native_ffmpeg().as_deref()))
        .await
        .map_err(|_| "Could not finalize the export.")?;
    drop(slot);
    result.map_err(|error| format!("Cannot finalize the export: {:?}.", error.kind()))
}

#[tauri::command]
pub async fn abort_export_save(state: State<'_, ExportState>, id: String) -> Result<(), String> {
    let mut slot = state.lock().await;
    if slot.as_ref().is_some_and(|job| matches(job, &id)) {
        *slot = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn accepts_binary_and_valid_post_message_chunks_only() {
        let raw = InvokeBody::Raw(vec![0, 128, 255]);
        let json = InvokeBody::Json("[0,128,255]".parse().unwrap());
        assert_eq!(export_bytes(&raw).unwrap().as_ref(), &[0, 128, 255]);
        assert_eq!(export_bytes(&json).unwrap().as_ref(), &[0, 128, 255]);
        for invalid in ["[256]", "[-1]", "[0.5]", "{}"] {
            let body = InvokeBody::Json(invalid.parse().unwrap());
            assert!(export_bytes(&body).is_err());
        }
    }

    #[test]
    fn partial_transfer_cannot_replace_existing_export() -> io::Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("edit.mp4");
        fs::write(&path, b"existing video")?;
        let mut job = ExportJob::new(path.clone(), Container::Mp4, 5)?;
        job.write(b"ab")?;
        assert!(job.write(b"cdef").is_err());
        assert!(job.finish(None).is_err());
        assert_eq!(fs::read(&path)?, b"existing video");
        assert_eq!(fs::read_dir(dir.path())?.count(), 1);
        Ok(())
    }

    #[test]
    fn complete_transfer_replaces_destination_and_cleans_staging() -> io::Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("edit.webm");
        fs::write(&path, b"old")?;
        let mut job = ExportJob::new(path.clone(), Container::Webm, 4)?;
        job.write(b"ab")?;
        job.write(b"cd")?;
        assert_eq!(job.finish(None)?, "original");
        assert_eq!(fs::read(&path)?, b"abcd");
        assert_eq!(fs::read_dir(dir.path())?.count(), 1);
        Ok(())
    }

    #[test]
    fn png_exports_bypass_remux_and_reject_wrong_signatures() -> io::Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("frame.png");
        let png = b"\x89PNG\r\n\x1a\nthumbnail";
        let container = Container::for_name("frame.PNG").unwrap();
        let mut job = ExportJob::new(path.clone(), container, png.len() as u64)?;
        job.write(png)?;
        assert_eq!(job.finish(Some(Path::new("unused-ffmpeg")))?, "original");
        let mut invalid = ExportJob::new(path.clone(), container, 9)?;
        invalid.write(b"not a png")?;
        assert_eq!(
            invalid.finish(None).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(fs::read(path)?, png);
        Ok(())
    }

    #[test]
    #[ignore = "requires system FFmpeg and ffprobe"]
    fn remux_preserves_video_and_audio() -> io::Result<()> {
        let ffmpeg = native_ffmpeg().expect("install FFmpeg in a supported system location");
        let ffprobe = ffmpeg.with_file_name("ffprobe");
        let dir = tempfile::tempdir()?;
        for (container, encoder, audio) in [
            (Container::Mp4, "mpeg4", "aac"),
            (Container::Webm, "libvpx-vp9", "libopus"),
        ] {
            let ext = container.extension();
            let source = dir.path().join(format!("source.{ext}"));
            let destination = dir.path().join(format!("export.{ext}"));
            assert!(
                Command::new(&ffmpeg)
                    .args([
                        "-loglevel",
                        "error",
                        "-f",
                        "lavfi",
                        "-i",
                        "color=c=blue:s=64x64:r=24:d=1",
                        "-f",
                        "lavfi",
                        "-i",
                        "sine=frequency=400:duration=1",
                        "-c:v",
                        encoder,
                        "-c:a",
                        audio,
                        "-shortest",
                    ])
                    .arg(&source)
                    .status()?
                    .success()
            );
            let bytes = fs::read(&source)?;
            let mut job = ExportJob::new(destination.clone(), container, bytes.len() as u64)?;
            job.write(&bytes)?;
            assert_eq!(job.finish(Some(&ffmpeg))?, "remuxed");
            let probe = |path: &Path| -> io::Result<Vec<u8>> {
                let result = Command::new(&ffprobe)
                    .args([
                        "-v",
                        "error",
                        "-count_packets",
                        "-show_entries",
                        "stream=codec_type,codec_name,nb_read_packets",
                        "-of",
                        "csv=p=0",
                    ])
                    .arg(path)
                    .output()?;
                assert!(result.status.success());
                Ok(result.stdout)
            };
            let original_streams = probe(&source)?;
            let tracks = String::from_utf8_lossy(&original_streams);
            assert!(tracks.contains("video") && tracks.contains("audio"));
            assert_eq!(probe(&destination)?, original_streams);
        }
        Ok(())
    }

    #[test]
    fn missing_ffmpeg_keeps_original_export() -> io::Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("edit.mp4");
        let mut job = ExportJob::new(path.clone(), Container::Mp4, 4)?;
        job.write(b"abcd")?;
        assert_eq!(
            job.finish(Some(&dir.path().join("missing-ffmpeg")))?,
            "remux-failed"
        );
        assert_eq!(fs::read(&path)?, b"abcd");
        Ok(())
    }
}
