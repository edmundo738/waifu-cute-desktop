//! Waifu Cute Desktop — Tauri 2 shell.
//! The frontend (React + TS) renders the companion stage; the shell provides the
//! transparent always-on-top window and can emit `companion://trigger` events to
//! drive reactions from native desktop integrations (notifications, hotkeys).

use tauri::Emitter;

#[tauri::command]
fn fire_trigger(app: tauri::AppHandle, trigger: String) -> Result<(), String> {
    app.emit("companion://trigger", serde_json::json!({ "trigger": trigger }))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fire_trigger])
        .run(tauri::generate_context!())
        .expect("error while running waifu-cute-desktop");
}
