//! OS-keychain storage for AI provider API keys.
//!
//! Keys never cross back into the webview: there is deliberately no
//! `get_api_key` command, only `ai_agent_has_api_key`.

use keyring::Entry;

const SERVICE: &str = "salvador-resolve";

fn validate_provider(provider: &str) -> Result<(), String> {
    match provider {
        "anthropic" => Ok(()),
        other => Err(format!("unsupported provider: {other}")),
    }
}

/// Rust-side read used by the LLM proxy only.
pub(crate) fn read_api_key(provider: &str) -> Result<Option<String>, String> {
    validate_provider(provider)?;
    let entry = Entry::new(SERVICE, provider).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) if !v.is_empty() => Ok(Some(v)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn ai_agent_set_api_key(provider: String, key: String) -> Result<(), String> {
    validate_provider(&provider)?;
    let key = key.trim();
    if key.is_empty() {
        return Err("API key is empty".into());
    }
    let entry = Entry::new(SERVICE, &provider).map_err(|e| e.to_string())?;
    entry.set_password(key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_agent_has_api_key(provider: String) -> Result<bool, String> {
    Ok(read_api_key(&provider)?.is_some())
}

#[tauri::command]
pub fn ai_agent_delete_api_key(provider: String) -> Result<(), String> {
    validate_provider(&provider)?;
    let entry = Entry::new(SERVICE, &provider).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
