//! Request authentication for the local MCP endpoint.
//!
//! Two independent checks:
//! 1. `Authorization: Bearer <token>` (constant-time compare).
//! 2. DNS-rebinding guard: `Host` must be loopback on our port, and a present
//!    `Origin` must be a loopback origin (browsers always send Origin on
//!    cross-site fetches, so a malicious page is rejected even if it guessed
//!    the token).

#[derive(Debug, PartialEq, Eq)]
pub enum AuthError {
    /// 401 — missing or wrong bearer token.
    Unauthorized,
    /// 403 — Host/Origin not loopback.
    Forbidden(&'static str),
}

const LOOPBACK_HOSTS: &[&str] = &["127.0.0.1", "localhost", "[::1]"];

/// Generate a fresh 256-bit token (two v4 UUIDs = 244 random bits from the OS RNG), hex encoded.
pub fn generate_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn check_bearer(header: Option<&str>, expected: &str) -> Result<(), AuthError> {
    if expected.is_empty() {
        return Err(AuthError::Unauthorized);
    }
    let presented = header
        .and_then(|h| {
            h.strip_prefix("Bearer ")
                .or_else(|| h.strip_prefix("bearer "))
        })
        .map(str::trim)
        .ok_or(AuthError::Unauthorized)?;
    if constant_time_eq(presented.as_bytes(), expected.as_bytes()) {
        Ok(())
    } else {
        Err(AuthError::Unauthorized)
    }
}

/// `host` must be `<loopback>:<port>` (or bare loopback, which some clients send for port 80 — rejected
/// unless it carries our port).
pub fn check_host(host: Option<&str>, port: u16) -> Result<(), AuthError> {
    let host = host.ok_or(AuthError::Forbidden("missing Host header"))?;
    let ok = LOOPBACK_HOSTS
        .iter()
        .any(|h| host.eq_ignore_ascii_case(&format!("{h}:{port}")));
    if ok {
        Ok(())
    } else {
        Err(AuthError::Forbidden(
            "Host is not a loopback address for this server",
        ))
    }
}

/// A missing Origin is fine (CLI clients); a present one must be `http(s)://<loopback>[:port]`.
pub fn check_origin(origin: Option<&str>) -> Result<(), AuthError> {
    let Some(origin) = origin else { return Ok(()) };
    let rest = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"))
        .ok_or(AuthError::Forbidden("Origin is not allowed"))?;
    let host = if let Some(stripped) = rest.strip_prefix('[') {
        // IPv6 literal: "[::1]:port"
        stripped
            .split(']')
            .next()
            .map(|h| format!("[{h}]"))
            .unwrap_or_default()
    } else {
        rest.split(':').next().unwrap_or_default().to_string()
    };
    if LOOPBACK_HOSTS.iter().any(|h| host.eq_ignore_ascii_case(h)) {
        Ok(())
    } else {
        Err(AuthError::Forbidden("Origin is not allowed"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_tokens_are_long_and_unique() {
        let a = generate_token();
        let b = generate_token();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }

    #[test]
    fn bearer_accepts_exact_token_only() {
        assert_eq!(check_bearer(Some("Bearer abc"), "abc"), Ok(()));
        assert_eq!(
            check_bearer(Some("Bearer abd"), "abc"),
            Err(AuthError::Unauthorized)
        );
        assert_eq!(
            check_bearer(Some("Bearer ab"), "abc"),
            Err(AuthError::Unauthorized)
        );
        assert_eq!(
            check_bearer(Some("abc"), "abc"),
            Err(AuthError::Unauthorized)
        );
        assert_eq!(check_bearer(None, "abc"), Err(AuthError::Unauthorized));
    }

    #[test]
    fn bearer_rejects_everything_when_no_token_configured() {
        assert_eq!(
            check_bearer(Some("Bearer "), ""),
            Err(AuthError::Unauthorized)
        );
    }

    #[test]
    fn host_must_be_loopback_with_our_port() {
        assert!(check_host(Some("127.0.0.1:47821"), 47821).is_ok());
        assert!(check_host(Some("LOCALHOST:47821"), 47821).is_ok());
        assert!(check_host(Some("[::1]:47821"), 47821).is_ok());
        // DNS rebinding: attacker domain resolving to 127.0.0.1
        assert!(check_host(Some("evil.example:47821"), 47821).is_err());
        assert!(check_host(Some("127.0.0.1:47822"), 47821).is_err());
        assert!(check_host(Some("127.0.0.1"), 47821).is_err());
        assert!(check_host(None, 47821).is_err());
    }

    #[test]
    fn origin_absent_or_loopback_allowed_foreign_rejected() {
        assert!(check_origin(None).is_ok());
        assert!(check_origin(Some("http://localhost:6274")).is_ok());
        assert!(check_origin(Some("http://127.0.0.1")).is_ok());
        assert!(check_origin(Some("http://[::1]:3000")).is_ok());
        assert!(check_origin(Some("https://evil.example")).is_err());
        assert!(check_origin(Some("http://localhost.evil.example")).is_err());
        assert!(check_origin(Some("null")).is_err());
        assert!(check_origin(Some("tauri://localhost")).is_err());
    }
}
