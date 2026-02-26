use std::{
    path::{PathBuf},
    process::Command,
};

pub fn get_multipass_path() -> String {
    resolve_multipass_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "multipass".to_string())
}

/// Findet die Multipass-CLI auf dem Host.
/// - macOS: bevorzugt den Canonical-Install-Pfad, dann /usr/local, dann Homebrew.
/// - Windows: prüft typische Program Files-Pfade, dann `where multipass`.
/// - Linux: prüft /snap/bin, dann PATH.
///
/// Gibt den absoluten Pfad zur multipass-Binary zurück.
pub fn resolve_multipass_path() -> Result<PathBuf, String> {
    // 1) Kandidaten je OS prüfen
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from(
            "/Library/Application Support/com.canonical.multipass/bin/multipass",
        ));
        candidates.push(PathBuf::from("/usr/local/bin/multipass"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/multipass"));
    }

    #[cfg(target_os = "windows")]
    {
        let pf = env::var_os("ProgramFiles").map(PathBuf::from);
        let pfx86 = env::var_os("ProgramFiles(x86)").map(PathBuf::from);

        if let Some(pf) = pf {
            candidates.push(pf.join("Multipass\\bin\\multipass.exe"));
            candidates.push(pf.join("Multipass\\multipass.exe"));
        }
        if let Some(pfx86) = pfx86 {
            candidates.push(pfx86.join("Multipass\\bin\\multipass.exe"));
            candidates.push(pfx86.join("Multipass\\multipass.exe"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/snap/bin/multipass"));
        candidates.push(PathBuf::from("/usr/bin/multipass"));
        candidates.push(PathBuf::from("/usr/local/bin/multipass"));
    }

    for p in candidates {
        if p.is_file() {
            return Ok(p);
        }
    }

    // 2) Fallback: über PATH finden (ohne Shell-Plugin, rein via process spawning)
    // macOS/Linux: `command -v multipass`
    // Windows: `where multipass`
    let from_path = find_on_path_fallback().map_err(|e| format!("multipass not found: {e}"))?;
    Ok(from_path)
}

fn find_on_path_fallback() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let out = Command::new("where")
            .arg("multipass")
            .output()
            .map_err(|e| format!("failed to run `where multipass`: {e}"))?;

        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).to_string());
        }

        // `where` kann mehrere Zeilen liefern – nimm die erste
        let stdout = String::from_utf8_lossy(&out.stdout);
        let first = stdout.lines().next().ok_or("`where` returned no lines")?;
        let p = PathBuf::from(first.trim());
        if p.is_file() {
            Ok(p)
        } else {
            Err(format!("`where` returned non-file path: {first}"))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let out = Command::new("sh")
            .arg("-lc")
            .arg("command -v multipass")
            .output()
            .map_err(|e| format!("failed to run `command -v multipass`: {e}"))?;

        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&out.stdout);
        let p = PathBuf::from(stdout.trim());
        if p.is_file() {
            Ok(p)
        } else {
            Err(format!("PATH lookup returned non-file path: {}", stdout.trim()))
        }
    }
}