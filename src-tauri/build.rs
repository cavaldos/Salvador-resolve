fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "begin_export_save",
            "write_export_chunk",
            "finish_export_save",
            "abort_export_save",
            "open_project_folder",
            "save_project_folder",
        ]),
    ))
    .expect("invalid Tauri build configuration");
}
