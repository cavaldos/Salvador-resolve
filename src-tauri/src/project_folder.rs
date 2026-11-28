use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs::{self, File},
    hash::{DefaultHasher, Hash, Hasher},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tempfile::NamedTempFile;
use uuid::Uuid;

const PROJECT_FILE: &str = "Salvador.salvador.json";
const MAX_PROJECT_BYTES: usize = 32 * 1024 * 1024;

#[derive(Default)]
pub struct FolderState(Mutex<()>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSnapshot {
    id: String,
    name: String,
    document: Option<String>,
    revision: Option<String>,
    videos: Vec<FolderVideo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderVideo {
    name: String,
    path: String,
    size: u64,
    modified_at: u64,
}

fn grant_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(message)?
        .join("project-folders.json"))
}

fn read_grants(path: &Path) -> Result<BTreeMap<String, PathBuf>, String> {
    match fs::read(path) {
        Ok(contents) => serde_json::from_slice(&contents).map_err(message),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(error) => Err(message(error)),
    }
}

fn authorized_folder(grants: &BTreeMap<String, PathBuf>, id: &str) -> Result<PathBuf, String> {
    let unavailable =
        || "Project folder is unavailable. Use Open folder to locate it again.".to_string();
    let root = grants.get(id).ok_or_else(unavailable)?;
    if root.canonicalize().map_err(|_| unavailable())? != *root || !root.is_dir() {
        return Err(unavailable());
    }
    Ok(root.clone())
}

fn atomic_write(path: &Path, contents: &[u8], replace: bool) -> Result<(), String> {
    let mut temporary =
        NamedTempFile::new_in(path.parent().ok_or("Invalid project path.")?).map_err(message)?;
    temporary.write_all(contents).map_err(message)?;
    temporary.as_file().sync_all().map_err(message)?;
    if replace {
        temporary.persist(path).map_err(message)?;
    } else {
        temporary.persist_noclobber(path).map_err(message)?;
    }
    Ok(())
}

fn read_project(root: &Path) -> Result<Option<String>, String> {
    let path = root.join(PROJECT_FILE);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() => (),
        Ok(_) => return Err(format!("{PROJECT_FILE} must be a regular file.")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(message(error)),
    }
    let mut document = String::new();
    File::open(path)
        .map_err(message)?
        .take((MAX_PROJECT_BYTES + 1) as u64)
        .read_to_string(&mut document)
        .map_err(message)?;
    if document.len() > MAX_PROJECT_BYTES {
        return Err("Project file is too large.".into());
    }
    Ok(Some(document))
}

fn revision(document: &str) -> String {
    let mut hasher = DefaultHasher::new();
    document.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn project_id(document: &str) -> Result<String, String> {
    let parsed: Value = serde_json::from_str(document).map_err(message)?;
    if parsed["version"].as_u64() != Some(1) {
        return Err("Unsupported Salvador project file version.".into());
    }
    parsed["project"]["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "Invalid Salvador project file.".into())
}

fn save_project(root: &Path, document: &str, expected: Option<&str>) -> Result<String, String> {
    if document.len() > MAX_PROJECT_BYTES {
        return Err("Project file is too large.".into());
    }
    let id = project_id(document)?;
    let existing = read_project(root)?;
    if existing.as_deref().map(revision).as_deref() != expected {
        return Err("Project file changed on disk. Reopen the folder before saving again.".into());
    }
    if let Some(previous) = &existing
        && project_id(previous)? != id
    {
        return Err("This folder already contains a different Salvador project.".into());
    }
    atomic_write(
        &root.join(PROJECT_FILE),
        document.as_bytes(),
        existing.is_some(),
    )?;
    Ok(revision(document))
}

fn list_videos(root: &Path) -> Result<Vec<FolderVideo>, String> {
    let mut videos = Vec::new();
    for entry in fs::read_dir(root).map_err(message)? {
        let entry = entry.map_err(message)?;
        if !entry.file_type().map_err(message)?.is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = entry.file_name().into_string().ok() else {
            continue;
        };
        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        // shortcut: skip non-portable names, add escaping if those files need support.
        if name.starts_with('.')
            || name.contains('\\')
            || !matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp4" | "webm" | "mov" | "m4v" | "mkv"
            )
        {
            continue;
        }
        let canonical = path.canonicalize().map_err(message)?;
        if canonical.parent() != Some(root) || canonical != path {
            continue;
        }
        let Some(path) = canonical.to_str() else {
            continue;
        };
        let metadata = entry.metadata().map_err(message)?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|date| date.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or_default();
        videos.push(FolderVideo {
            name,
            path: path.to_owned(),
            size: metadata.len(),
            modified_at,
        });
    }
    videos.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(videos)
}

fn open_folder(
    app: &AppHandle,
    chosen: Option<PathBuf>,
    id: Option<String>,
) -> Result<FolderSnapshot, String> {
    let state = app.state::<FolderState>();
    let _guard = state.0.lock().map_err(message)?;
    let registry = grant_path(app)?;
    let mut grants = read_grants(&registry)?;
    let is_new_pick = chosen.is_some();
    let (id, root) = if let Some(path) = chosen {
        let root = path.canonicalize().map_err(message)?;
        let id = grants
            .iter()
            .find(|(_, path)| **path == root)
            .map(|(id, _)| id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        (id, root)
    } else {
        let id = id.ok_or("Missing project folder ID.")?;
        let root = authorized_folder(&grants, &id)?;
        (id, root)
    };
    let document = read_project(&root)?;
    if !is_new_pick && document.is_none() {
        return Err(format!(
            "{PROJECT_FILE} is missing. Use Open folder to locate your project."
        ));
    }
    let videos = list_videos(&root)?;
    for video in &videos {
        app.asset_protocol_scope()
            .allow_file(&video.path)
            .map_err(message)?;
    }
    if !grants.contains_key(&id) {
        grants.insert(id.clone(), root.clone());
        fs::create_dir_all(registry.parent().ok_or("Invalid app data path.")?).map_err(message)?;
        atomic_write(
            &registry,
            &serde_json::to_vec(&grants).map_err(message)?,
            true,
        )?;
    }
    Ok(FolderSnapshot {
        id,
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Untitled video".into()),
        revision: document.as_deref().map(revision),
        document,
        videos,
    })
}

#[tauri::command]
pub async fn open_project_folder(
    app: AppHandle,
    folder_id: Option<String>,
) -> Result<Option<FolderSnapshot>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let chosen = if folder_id.is_none() {
            match app
                .dialog()
                .file()
                .set_title("Open a Salvador project folder")
                .blocking_pick_folder()
            {
                Some(path) => Some(path.into_path().map_err(message)?),
                None => return Ok(None),
            }
        } else {
            None
        };
        open_folder(&app, chosen, folder_id).map(Some)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn save_project_folder(
    app: AppHandle,
    folder_id: String,
    document: String,
    expected_revision: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<FolderState>();
        let _guard = state.0.lock().map_err(message)?;
        let root = authorized_folder(&read_grants(&grant_path(&app)?)?, &folder_id)?;
        save_project(&root, &document, expected_revision.as_deref())
    })
    .await
    .map_err(message)?
}

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_and_updates_only_the_expected_document() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let first = r#"{"version":1,"project":{"id":"first"}}"#;
        let update = r#"{"version":1,"project":{"id":"first","name":"edited"}}"#;
        let other = r#"{"version":1,"project":{"id":"other"}}"#;
        let current = save_project(root, first, None).unwrap();
        assert!(save_project(root, other, Some(&current)).is_err());
        assert!(save_project(root, update, None).is_err());
        assert_ne!(current, save_project(root, update, Some(&current)).unwrap());
        assert_eq!(read_project(root).unwrap().as_deref(), Some(update));
        assert!(save_project(root, first, Some(&current)).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn never_replaces_a_linked_project_file() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let original = root.join("original.json");
        fs::write(&original, "keep me").unwrap();
        std::os::unix::fs::symlink(&original, root.join(PROJECT_FILE)).unwrap();
        let document = r#"{"version":1,"project":{"id":"first"}}"#;
        assert!(save_project(root, document, None).is_err());
        assert_eq!(fs::read_to_string(original).unwrap(), "keep me");
    }

    #[test]
    fn scans_top_level_video_files_only() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        fs::create_dir(root.join("nested")).unwrap();
        for name in [
            "b.MOV",
            "a.mp4",
            ".hidden.mp4",
            "notes.txt",
            "nested/file.mp4",
        ] {
            fs::write(root.join(name), [0]).unwrap();
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(root.join("a.mp4"), root.join("linked.mp4")).unwrap();
        let names: Vec<_> = list_videos(&root)
            .unwrap()
            .into_iter()
            .map(|video| video.name)
            .collect();
        assert_eq!(names, ["a.mp4", "b.MOV"]);
    }
}
