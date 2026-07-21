use std::process::Command;

fn main() {
    // In environments without .git (e.g. Docker builds), accept values via
    // ARG→ENV from the host. Falls back to git when env vars are absent.
    let hash = env_or_git("GIT_HASH", &["rev-parse", "--short", "HEAD"]);
    println!("cargo:rustc-env=GIT_HASH={hash}");

    let date = env_or_git("BUILD_DATE", &["log", "-1", "--format=%cs"]);
    println!("cargo:rustc-env=BUILD_DATE={date}");

    // Version is sourced from package.json (single source of truth)
    let version = package_version().unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=PKG_VERSION={version}");

    println!("cargo:rerun-if-env-changed=GIT_HASH");
    println!("cargo:rerun-if-env-changed=BUILD_DATE");
    println!("cargo:rerun-if-changed=package.json");
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-changed=.git/refs");
}

fn package_version() -> Option<String> {
    let json = std::fs::read_to_string("package.json").ok()?;
    let rest = &json[json.find("\"version\"")? + "\"version\"".len()..];
    let rest = &rest[rest.find('"')? + 1..];
    non_empty(Some(rest[..rest.find('"')?].to_string()))
}

fn env_or_git(var: &str, git_args: &[&str]) -> String {
    non_empty(std::env::var(var).ok())
        .or_else(|| git(git_args))
        .unwrap_or_else(|| "unknown".to_string())
}

fn git(args: &[&str]) -> Option<String> {
    let output = Command::new("git").args(args).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).to_string())
        .and_then(|s| non_empty(Some(s)))
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}
