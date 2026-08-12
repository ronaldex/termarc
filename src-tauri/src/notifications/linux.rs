use std::process::Command;

pub(super) fn notify_agent_ready(body: String) -> bool {
    let mut command = Command::new("notify-send");
    command.args([
        "--app-name=Termarc",
        "--icon=utilities-terminal",
        "--expire-time=5000",
        "Pi is ready",
        &body,
    ]);
    play(command)
}

pub(super) fn play_agent_ready_sound() -> bool {
    // Player processes wait for the full sample duration. Run them separately
    // so consecutive agent-ready events never stall Tauri's invoke handler.
    std::thread::Builder::new()
        .name("agent-ready-sound".into())
        .spawn(|| {
            let _ = play_agent_ready_sound_blocking();
        })
        .is_ok()
}

fn play_agent_ready_sound_blocking() -> bool {
    // Use PulseAudio/PipeWire directly with an explicit stream volume. Unlike
    // libcanberra's event stream, this does not restore a per-application gain
    // that can make the first notification quieter than later ones.
    const SOUND: &str = "/usr/share/sounds/freedesktop/stereo/message-new-instant.oga";
    let mut paplay = Command::new("paplay");
    paplay.args(["--volume=65536", SOUND]);
    if play(paplay) {
        return true;
    }

    let mut pipewire = Command::new("pw-play");
    pipewire.arg(SOUND);
    if play(pipewire) {
        return true;
    }

    // Keep the sound-theme-aware player as a fallback for systems without the
    // standard freedesktop sound file or PulseAudio/PipeWire command clients.
    play(canberra_command())
}

fn canberra_command() -> Command {
    let mut command = Command::new("canberra-gtk-play");
    command.args([
        "--id",
        "message-new-instant",
        "--volume",
        "0",
        "--cache-control",
        "permanent",
    ]);
    command
}

fn play(mut command: Command) -> bool {
    command.status().is_ok_and(|status| status.success())
}
