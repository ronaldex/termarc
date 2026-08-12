// Uses Cocoa APIs that Tauri exposes only on macOS.
#![allow(deprecated)]

use cocoa::{
    appkit::{NSView, NSWindow, NSWindowStyleMask, NSWindowTitleVisibility},
    base::id,
    foundation::NSPoint,
};
use objc::{msg_send, sel, sel_impl};
use tauri::{AppHandle, Runtime, WebviewWindow};

#[derive(Default)]
struct TrafficLightsConfig {
    offset_x: f64,
    offset_y: f64,
}

#[tauri::command]
pub fn enable_rounded_corners<R: Runtime>(
    _app: AppHandle<R>,
    window: WebviewWindow<R>,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
) -> Result<(), String> {
    let config = TrafficLightsConfig {
        offset_x: offset_x.unwrap_or(0.0),
        offset_y: offset_y.unwrap_or(0.0),
    };

    window
        .with_webview(move |webview| unsafe {
            let ns_window = webview.ns_window() as id;
            let mut style_mask = ns_window.styleMask();
            style_mask |= NSWindowStyleMask::NSFullSizeContentViewWindowMask;
            style_mask |= NSWindowStyleMask::NSTitledWindowMask;
            style_mask |= NSWindowStyleMask::NSClosableWindowMask;
            style_mask |= NSWindowStyleMask::NSMiniaturizableWindowMask;
            style_mask |= NSWindowStyleMask::NSResizableWindowMask;
            ns_window.setStyleMask_(style_mask);
            ns_window.setTitlebarAppearsTransparent_(cocoa::base::YES);

            let content_view = ns_window.contentView();
            content_view.setWantsLayer(cocoa::base::YES);
            position_traffic_lights(ns_window, config.offset_x, config.offset_y);
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn enable_modern_window_style<R: Runtime>(
    _app: AppHandle<R>,
    window: WebviewWindow<R>,
    corner_radius: Option<f64>,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
) -> Result<(), String> {
    let config = TrafficLightsConfig {
        offset_x: offset_x.unwrap_or(0.0),
        offset_y: offset_y.unwrap_or(0.0),
    };
    let radius = corner_radius.unwrap_or(12.0);

    window
        .with_webview(move |webview| unsafe {
            let ns_window = webview.ns_window() as id;
            let mut style_mask = ns_window.styleMask();
            style_mask |= NSWindowStyleMask::NSFullSizeContentViewWindowMask;
            style_mask |= NSWindowStyleMask::NSTitledWindowMask;
            style_mask |= NSWindowStyleMask::NSClosableWindowMask;
            style_mask |= NSWindowStyleMask::NSMiniaturizableWindowMask;
            style_mask |= NSWindowStyleMask::NSResizableWindowMask;
            ns_window.setStyleMask_(style_mask);
            ns_window.setTitlebarAppearsTransparent_(cocoa::base::YES);
            ns_window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden);
            ns_window.setHasShadow_(cocoa::base::YES);
            ns_window.setOpaque_(cocoa::base::NO);

            let content_view = ns_window.contentView();
            content_view.setWantsLayer(cocoa::base::YES);
            let layer: id = msg_send![content_view, layer];
            if !layer.is_null() {
                let _: () = msg_send![layer, setCornerRadius: radius];
                let _: () = msg_send![layer, setMasksToBounds: cocoa::base::YES];
            }
            position_traffic_lights(ns_window, config.offset_x, config.offset_y);
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reposition_traffic_lights<R: Runtime>(
    _app: AppHandle<R>,
    window: WebviewWindow<R>,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
) -> Result<(), String> {
    let config = TrafficLightsConfig {
        offset_x: offset_x.unwrap_or(0.0),
        offset_y: offset_y.unwrap_or(0.0),
    };

    window
        .with_webview(move |webview| unsafe {
            position_traffic_lights(webview.ns_window() as id, config.offset_x, config.offset_y);
        })
        .map_err(|error| error.to_string())
}

unsafe fn position_traffic_lights(ns_window: id, offset_x: f64, offset_y: f64) {
    let new_x = 20.0 + offset_x;
    let new_y = -offset_y;

    for (index, x) in [(0, new_x), (1, new_x + 20.0), (2, new_x + 40.0)] {
        let button: id = msg_send![ns_window, standardWindowButton: index];
        if !button.is_null() {
            let frame: cocoa::foundation::NSRect = msg_send![button, frame];
            let new_frame = cocoa::foundation::NSRect::new(NSPoint::new(x, new_y), frame.size);
            let _: () = msg_send![button, setFrame: new_frame];
        }
    }
}
