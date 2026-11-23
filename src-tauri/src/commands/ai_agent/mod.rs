//! AI editing agent backend: Anthropic streaming proxy + keychain secrets.
//! (Distinct from `commands::ai`, which hosts local ML features.)

pub mod llm_proxy;
pub mod secrets;
