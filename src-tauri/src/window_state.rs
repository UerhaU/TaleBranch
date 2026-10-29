use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

/// Size and place of the main window in screen pixels, kept in `TaleBranch-data/window.json`.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// A screen area in pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// How much of the window top must stay on a screen, so the window can still be grabbed and moved.
const VISIBLE_WIDTH: i64 = 120;
const VISIBLE_HEIGHT: i64 = 40;

fn overlap(start: i32, length: u32, other_start: i32, other_length: u32) -> i64 {
    let end = (start as i64 + length as i64).min(other_start as i64 + other_length as i64);
    end - (start as i64).max(other_start as i64)
}

/// The saved window as it can be shown now. The size never exceeds the screen it is on.
/// If its top no longer lies on any screen (a monitor was unplugged), it moves to the first screen.
pub fn fit_to_screens(state: WindowState, screens: &[Area]) -> WindowState {
    let Some(first) = screens.first() else {
        return state;
    };
    let top = screens.iter().find(|screen| {
        overlap(state.x, state.width, screen.x, screen.width) >= VISIBLE_WIDTH.min(state.width as i64)
            && overlap(state.y, VISIBLE_HEIGHT as u32, screen.y, screen.height) >= VISIBLE_HEIGHT
    });
    let screen = top.unwrap_or(first);
    let width = state.width.min(screen.width);
    let height = state.height.min(screen.height);
    if top.is_some() {
        return WindowState { width, height, ..state };
    }
    WindowState {
        x: screen.x + ((screen.width - width) / 2) as i32,
        y: screen.y + ((screen.height - height) / 2) as i32,
        width,
        height,
        ..state
    }
}

/// Remembers the last normal (not maximized or minimized) size and place while the window is open.
pub struct WindowMemory {
    file: PathBuf,
    state: Mutex<Option<WindowState>>,
}

impl WindowMemory {
    pub fn new(data: &Path) -> Self {
        let file = data.join("window.json");
        let state = std::fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<WindowState>(&bytes).ok())
            .filter(|state| state.width > 0 && state.height > 0);
        Self {
            file,
            state: Mutex::new(state),
        }
    }

    pub fn saved(&self) -> Option<WindowState> {
        *self.state.lock().unwrap()
    }

    /// The window was moved or resized while it was neither maximized nor minimized.
    pub fn normal(&self, x: i32, y: i32, width: u32, height: u32) {
        let mut state = self.state.lock().unwrap();
        *state = Some(WindowState {
            x,
            y,
            width,
            height,
            maximized: false,
        });
    }

    /// Writes the last normal size and place, and whether the window was maximized, when it closes.
    pub fn save(&self, maximized: bool) -> std::io::Result<()> {
        let Some(state) = self.saved() else {
            return Ok(());
        };
        let state = WindowState { maximized, ..state };
        crate::desktop_storage::atomic_write(&self.file, &serde_json::to_vec_pretty(&state)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Area = Area {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };
    const SMALL: WindowState = WindowState {
        x: 300,
        y: 200,
        width: 1024,
        height: 720,
        maximized: false,
    };

    #[test]
    fn a_window_on_a_screen_stays_where_it_was() {
        assert_eq!(fit_to_screens(SMALL, &[SCREEN]), SMALL);
        let partly_outside = WindowState { x: 1500, ..SMALL };
        assert_eq!(fit_to_screens(partly_outside, &[SCREEN]), partly_outside);
    }

    #[test]
    fn a_window_of_an_unplugged_monitor_returns_to_a_screen() {
        let on_second_monitor = WindowState { x: 2300, ..SMALL };
        assert_eq!(
            fit_to_screens(on_second_monitor, &[SCREEN]),
            WindowState {
                x: 448,
                y: 180,
                ..SMALL
            }
        );
        let above = WindowState { y: -700, ..SMALL };
        assert_eq!(fit_to_screens(above, &[SCREEN]).y, 180);
    }

    #[test]
    fn a_window_on_a_second_monitor_stays_there() {
        let left = Area { x: -1280, ..SCREEN };
        let window = WindowState { x: -1000, ..SMALL };
        assert_eq!(fit_to_screens(window, &[SCREEN, left]), window);
    }

    #[test]
    fn a_window_larger_than_the_screen_is_made_smaller() {
        let large = WindowState {
            width: 4000,
            height: 3000,
            ..SMALL
        };
        let fitted = fit_to_screens(large, &[SCREEN]);
        assert_eq!((fitted.width, fitted.height), (1920, 1080));
    }

    #[test]
    fn size_place_and_maximized_survive_a_restart() {
        let data = tempfile::tempdir().unwrap();
        let memory = WindowMemory::new(data.path());
        assert_eq!(memory.saved(), None);
        memory.save(true).unwrap();
        assert!(!data.path().join("window.json").exists());
        memory.normal(SMALL.x, SMALL.y, SMALL.width, SMALL.height);
        memory.save(true).unwrap();
        let reopened = WindowMemory::new(data.path());
        assert_eq!(
            reopened.saved(),
            Some(WindowState {
                maximized: true,
                ..SMALL
            })
        );
    }

    #[test]
    fn a_damaged_file_is_ignored() {
        let data = tempfile::tempdir().unwrap();
        std::fs::write(data.path().join("window.json"), "{ broken").unwrap();
        assert_eq!(WindowMemory::new(data.path()).saved(), None);
    }
}
