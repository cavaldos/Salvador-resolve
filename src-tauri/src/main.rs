// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod export;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(export::ExportState::default())
        .invoke_handler(tauri::generate_handler![
            export::begin_export_save,
            export::write_export_chunk,
            export::finish_export_save,
            export::abort_export_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cutnora");
}
