const Clutter	= imports.gi.Clutter;
const ExtUtils	= imports.misc.extensionUtils;
const GObject	= imports.gi.GObject;
const GLib 	= imports.gi.GLib;
const Main 	= imports.ui.main;
const MainLoop 	= imports.mainloop;
const Me	= imports.misc.extensionUtils.getCurrentExtension();
const Meta	= imports.gi.Meta;
const PanelMenu	= imports.ui.panelMenu;
const PopupMenu	= imports.ui.popupMenu;
const Shell 	= imports.gi.Shell;
const Slider	= imports.ui.slider;
const St	= imports.gi.St;

const Shared	= Me.imports.shared;

let gsettings = null;

// extension settings
let settings =
{
	updated: false,
	// string formats
	// %a% - atrist
	// %t% - title
	// %al% - album
	trayFormat: "%a% - %t%",
	notifyFormat: "%a% - %t% (%al%)",

	updateIntervalMs: 250,

	simpleTray: true,

	// key bindings
	bindings:
	{
		enabled: true,
		play: "<alt>c",
		back: "<alt>x",
		next: "<alt>v"
	},

	notification:
	{
		fadeStartTime: 2, fadeDuration: 5, // animation timers
		vPos: 2, hPos: 2, // 1 = left/top; 2 = center; 3 = right / bottom
		enabled: true
	},

	// formats the string
	format: function(str)
	{
		return str.replace("%a%", cmus.track.artist).replace("%t%", cmus.track.title).replace("%al%", cmus.track.album);
	}
};

// key manager
let keys =
{
	bindings: [],
	bound: false,

	connectId: null, // to disconnect listener later

	init: function()
	{	// initialize listener
		this.connectId = global.display.connect("accelerator-activated", (display, action, deviceId, timestamp) =>
		{
			for (let i = 0; i < this.bindings.length; i++)
			{
				if (this.bindings[i].code == action)
				{
					this.bindings[i].callback();
					break;
				}
			}
		});
	},

	addBinding: function(binding, callback)
	{	// create binding
		const keyAction = global.display.grab_accelerator(binding, Meta.KeyBindingFlags.NONE);
		if (keyAction == Meta.KeyBindingAction.NONE)
		{
			log("cmus-status: Unable to bind " + binding);
		}
		else
		{
			const keyName = Meta.external_binding_name_for_action(keyAction);

			Main.wm.allowKeybinding(keyName, Shell.ActionMode.ALL);

			const keyCode = keyName.substring(keyName.lastIndexOf("-") + 1);

			this.bindings[this.bindings.length] = 
			{
				binding: binding,
				action: keyAction,
				name: keyName,
				code: keyCode,
				callback: callback
			};

			log("cmus-status: Bound " + binding + ": name : " + keyName + "; №" + keyCode);
		}
	},

	detach: function()
	{	// remove all keybindings and a listener
		for (let i = 0; i < this.bindings.length; i++)
		{
			global.display.ungrab_accelerator(this.bindings[i].action);
			Main.wm.allowKeybinding(this.bindings[i].name, Shell.ActionMode.NONE);
			log("cmus-status: Unbound " + this.bindings[i].binding + ": name: " + this.bindings[i].name + "; №" + this.bindings[i].code);
		}

		this.bindings = [];

		global.display.disconnect(this.connectId);
	}
};

// notification object
let notification =
{
	offset: 10, // notification offset
	hideIndex: 0, // workaround to not remove notification from the screen too early when changing tracks fast
	actor: null, // notification
	notification_text: "TEST",
	
	show: function()
	{	// show notification
		this.hide(this.hideIndex);

		if (!this.actor)
		{
			this.actor = new St.Label({ style_class: "notification-label", text: this.notification_text });
			Main.uiGroup.add_actor(this.actor);
		}
		this.actor.opacity = 255;

		let monitor = Main.layoutManager.primaryMonitor;

		// calculate notification position
		let posX = 0;
		if (settings.notification.hPos == 0) posX = this.offset;
		if (settings.notification.hPos == 1) posX = monitor.x + Math.floor(monitor.width / 2 - this.actor.width / 2);
		if (settings.notification.hPos == 2) posX = monitor.x + monitor.width - this.actor.width - this.offset;

		let posY = 0;
		if (settings.notification.vPos == 0) posY = this.offset;
		if (settings.notification.vPos == 1) posY = monitor.y + Math.floor(monitor.height / 2 - this.actor.height / 2);
		if (settings.notification.vPos == 2) posY = monitor.y + monitor.height - this.actor.height - this.offset;

		this.actor.set_position(posX, posY);

		this.hideIndex++;

		const current = this.hideIndex;

		// set hide timeout
		MainLoop.timeout_add_seconds(settings.notification.fadeStartTime, () =>
		{
			this.actor.ease({
				opacity: 0,
				time: settings.notification.fadeDuration,
				transition: Clutter.AnimationMode.EASE_OUT_QUAD,
				onComplete: () => { this.hide(current); }
			});
		});
	},

	hide: function(index)
	{	// hide notification
		if ((this.actor != null) && (index == this.hideIndex))
		{
			Main.uiGroup.remove_actor(this.actor);
			this.actor = null;
		}
	},

	setText: function(text)
	{
		this.notification_text = text;
	}
};

// Tray management
const trayItem = GObject.registerClass({ GTypeName: "trayItem" }, class trayItem extends PanelMenu.Button {
	_init()	{	// tray initialization
		super._init(0.5, "cmus-status", false);

		this.main_box = null;			// Container for all tray ui
		// Playback buttons
		this.prev_button = null;
		this.button = null;
		this.next_button = null;
		// Middle button contents
		this.status_label = null;
		this.status_icon = null;
		this.popup_status_icon = null;
		this.trayed = false;			// Is system stray ui showed?
		this.caption = "tray label";		// Label caption
		this.time_label = null;			// Popup labels that display track current time/duration
		this.progress_bar = null;		// Bar that shows song progress

		this.bar_dragging = false;		// Lock bar from updating while dragging

		if (settings.simpleTray) this.initSimple();
		else this.initWPopup();
	}

	initWPopup() {
		// construct tray ui
		this.main_box = new St.BoxLayout();
		
		this.button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						track_hover: true });

		let box = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER, style_class: "panel-inner-box" });

		this.status_label = new St.Label({ text: this.caption, y_align: Clutter.ActorAlign.CENTER });
		this.status_icon = new St.Icon({ icon_name: "media-playback-pause-symbolic",
						style_class: "system-status-icon" });

		box.add_child(this.status_icon);
		box.add_child(this.status_label);

		this.button.set_child(box);

		this.main_box.add_child(this.button);

		this.actor.add_child(this.main_box);

		// create popup
		let progressItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });

		this.progress_bar = new Slider.Slider(0.5, { style_class: "popup-time-bar" });
		this.progress_bar.connect("drag-end", () => { this.bar_dragging = false; cmus.setPosition(this.progress_bar.value); });
		this.progress_bar.connect("drag-begin", () => { this.bar_dragging = true; });
		progressItem.actor.add(this.progress_bar);
		progressItem.actor.connect("button-press-event", (actor, event) => { return progress_bar.startDragging(event); });

		let timeItem = new PopupMenu.PopupBaseMenuItem({ style_class: "popup-time-label", reactive: false, can_focus: false });

		this.time_label = new St.Label({ style_class: "popup-time-label", text: "time / duration", x_expand: true });

		timeItem.actor.add_actor(this.time_label);

		let controlItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });

		let controlBin = new St.Bin({ x_expand: true });
		let controlBox = new St.BoxLayout({ style_class: "popup-control-panel", x_align: Clutter.ActorAlign.CENTER });

		let controlButtonPlay = new St.Button({ style_class: "system-menu-action",
							reactive: true,
							can_focus: true,
							track_hover: true });
		this.popup_status_icon = new St.Icon({ icon_name: "media-playback-pause-symbolic" });
		let controlButtonPrev = new St.Button({ style_class: "system-menu-action",
							reactive: true,
							can_focus: true,
							track_hover: true });
		let prevIcon = new St.Icon({ icon_name: "media-skip-backward-symbolic" });
		let controlButtonNext = new St.Button({	style_class: "system-menu-action", 
							reactive: true,
							can_focus: true,
							track_hover: true });
		let nextIcon = new St.Icon({ icon_name: "media-skip-forward-symbolic" });

		controlButtonPrev.set_child(prevIcon);
		controlButtonPlay.set_child(this.popup_status_icon);
		controlButtonNext.set_child(nextIcon);

		controlButtonPrev.connect("clicked", () => { cmus.back(); });
		controlButtonPlay.connect("clicked", () => { cmus.play_action(); });
		controlButtonNext.connect("clicked", () => { cmus.next(); });

		controlBox.add_child(controlButtonPrev);
		controlBox.add_child(controlButtonPlay);
		controlBox.add_child(controlButtonNext);

		controlBin.set_child(controlBox);

		controlItem.actor.add_actor(controlBin);

		this.menu.addMenuItem(progressItem);
		this.menu.addMenuItem(timeItem);
		this.menu.addMenuItem(controlItem);
	}
	
	initSimple() { // construct tray ui
		this.main_box = new St.BoxLayout();

		this.button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						track_hover: true });

		let box = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER, style_class: "panel-inner-box" });

		this.status_label = new St.Label({ text: this.caption, y_align: Clutter.ActorAlign.CENTER });
		this.status_icon = new St.Icon({ icon_name: "media-playback-pause-symbolic",
						style_class: "system-status-icon" });

		box.add_child(this.status_icon);
		box.add_child(this.status_label);

		this.button.set_child(box);

		this.button.connect("button-press-event", () =>
		{
			cmus.play_action();
		});

		this.prev_button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						track_hover: true });
		let prev_icon = new St.Icon({ icon_name: "media-skip-backward-symbolic",
						style_class: "system-status-icon" });

		this.prev_button.set_child(prev_icon);
		this.prev_button.connect("button-press-event", () =>
		{
			cmus.back();
		});

		this.next_button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						track_hover: true });
		let next_icon = new St.Icon({ icon_name: "media-skip-forward-symbolic",
						style_class: "system-status-icon" });

		this.next_button.set_child(next_icon);
		this.next_button.connect("button-press-event", () =>
		{
			cmus.next();
		});

		this.main_box.add_child(this.prev_button);
		this.main_box.add_child(this.button);
		this.main_box.add_child(this.next_button);

		this.actor.add_child(this.main_box);
	}

	show() {	// add to tray
		if (!this.trayed)
		{
			this.trayed = true;
			Main.panel.addToStatusArea("cmus-status", this, 0, "right");
		}
	}

	hide() {	// remove from tray
		if (this.trayed)
		{
			this.trayed = false;
			this.destroy();
		}
	}

	setCaption(newCaption) {
		this.caption = newCaption;
		if (this.status_label) this.status_label.text = newCaption;
	}

	updateStatus(newStatus) {	// updates middle button icon accordingly
		if (this.status_icon) switch (newStatus)
		{
			case "off": case "stopped":
				this.status_icon.icon_name = "media-playback-stop-symbolic";
				break;
			case "paused":
				this.status_icon.icon_name = "media-playback-pause-symbolic";
				break;
			case "playing":
				this.status_icon.icon_name = "media-playback-start-symbolic";
				break;
		}
		
		if (this.popup_status_icon) switch (newStatus)
		{
			case "off": case "stopped":
				this.popup_status_icon.icon_name = "media-playback-stop-symbolic";
				break;
			case "playing":
				this.popup_status_icon.icon_name = "media-playback-pause-symbolic";
				break;
			case "paused":
				this.popup_status_icon.icon_name = "media-playback-start-symbolic";
				break;
		}
	}

	setTime(time, duration) { // Updates time
		if (duration == 0)
		{
			if (this.time_label) this.time_label.set_text("-:-- / -:--");
			if (this.progress_bar) if (!this.bar_dragging) this.progress_bar.value = 0;
		}
		else
		{
			const t_sec = (time % 60 >= 10) ? time % 60 : "0" + time % 60;
			const t_min = (time - t_sec) / 60;
			const d_sec = (duration % 60 >= 10) ? duration % 60 : "0" + duration % 60;
			const d_min = (duration - d_sec) / 60;
			if (this.time_label) this.time_label.set_text(t_min + ":" + t_sec + " / " + d_min + ":" + d_sec);
			if (this.progress_bar) if (!this.bar_dragging) this.progress_bar.value = time / duration;
		}
	}
});
let tray = null;

// cmus controller
let cmus =
{
	state: "off",
	track: 
	{ 
		title: "title", 
		album: "album", 
		artist: "artist", 
		time: 0, 
		duration: 0 
	},
	default_track: 
	{ 
		title: "title", 
		album: "album", 
		artist: "artist", 
		time: 0, 
		duration: 0 
	},
	updated: false, // true if track info changed

	updateStatus: function()
	{	// recieves info from cmus-remote
		const std = GLib.spawn_command_line_sync("timeout 0.01 cmus-remote -Q");
		if (std[2].toString() != "") // check if theere are any errors. If cmus is off, stderr is also not empty
		{
			this.state = "off";
			this.track = this.default_track;
		}
		else if (std[1].toString() != "")
		{
			// resolve recieved data
			const stdout = std[1].toString().replace("/'/g", "\\`").split("\n"); // replace ' quotes with ` to avoid errors while parsing commands later

			// get cmus status
			this.state = stdout[0].replace(/status /g, "");

			if (this.state == "stopped")
			{
				this.track = this.default_track;
			}
			else
			{
				// get track info
				var title = "";
				var album = "";
				var artist = "";
				var duration = "";
				var time = "";

				for (var i = 1; i < stdout.length; i++)
				{
					if (stdout[i].includes("tag title ")) 	title = stdout[i].replace(/tag title /g, "");
					if (stdout[i].includes("tag album ")) 	album = stdout[i].replace(/tag album /g, "");
					if (stdout[i].includes("tag artist ")) 	artist = stdout[i].replace(/tag artist /g, "");
					if (stdout[i].includes("duration ")) 	duration = stdout[i].replace(/duration /g, "");
					if (stdout[i].includes("position ")) 	time = stdout[i].replace(/position /g, "");

					// in case there's no track title in tags
					if (stdout[i].includes("file ") && (title == "")) title = stdout[i].replace(/file /g, "").replace(/^.*[\\/]/g, "");
				}

				if ((this.track.title != title) || (this.track.album != album) || (this.track.artist != artist))
				{
					this.track.title = title;
					this.track.album = album;
					this.track.artist = artist;

					this.updated = true;
				}

				// some parameters do not require showing notification
				if ((this.track.time != time) || (this.track.duration != duration))
				{
					this.track.time = time;
					this.track.duration = duration;
				}
			}
		}
	},

	play: function()
	{
		GLib.spawn_command_line_async("cmus-remote -p");
	},

	pause: function()
	{
		GLib.spawn_command_line_async("cmus-remote -u");
	},

	launch: function()
	{
		const terminal = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec | sed \\\"s/'//g\\\"\"")[1].toString().replace("/n", "");
		const arg = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec-arg | sed \\\"s/'//g\\\"\"")[1].toString().replace("/n", "");
		if (terminal && arg) GLib.spawn_command_line_async(terminal + " " + arg + " cmus");
	},

	back: function()
	{
		GLib.spawn_command_line_async("cmus-remote -r");
	},

	next: function()
	{
		GLib.spawn_command_line_async("cmus-remote -n");
	},

	play_action: function()
	{	// we want to resume playing if paused, pause if playing, or turn on cmus if it is off
		switch (this.state)
		{
			case "off":
				this.launch();
				break;
			case "paused":
				this.play();
				break;
			case "playing":
				this.pause();
				break;
		}
	},

	setPosition: function(position)
	{
		const positionSec = Math.floor(this.track.duration * position);
		GLib.spawn_command_line_sync("cmus-remote -k " + positionSec);
	}
};

let enabled = false; // false to stop updating the status

// re-load settings from gsettings
function updateSettings()
{
	settings.updateIntervalMs = gsettings.get_int(Shared.updateIntervalKey);

	settings.notification.enabled = gsettings.get_boolean(Shared.enableNotKey);
	settings.notification.hPos = gsettings.get_int(Shared.notPosXKey);
	settings.notification.vPos = gsettings.get_int(Shared.notPosYKey);

	settings.notification.fadeStartTime = gsettings.get_int(Shared.notFadeStartKey);
	settings.notification.fadeDuration = gsettings.get_int(Shared.notFadeDurationKey);

	settings.trayFormat = gsettings.get_string(Shared.trayFormatKey);
	settings.notifyFormat = gsettings.get_string(Shared.notFormatKey);

	const newBindsEnabled = gsettings.get_boolean(Shared.enableBindsKey);
	if (newBindsEnabled != settings.bindings.enabled)
	{
		if (newBindsEnabled)
		{
			if (!keys.bound)
			{
				keys.init();
				keys.addBinding(settings.bindings.play, () => { cmus.play_action(); });
				keys.addBinding(settings.bindings.back, () => { cmus.back(); });
				keys.addBinding(settings.bindings.next, () => { cmus.next(); });
				keys.bound = true;
			}
		}
		else
		{

			if (keys.bound) 
			{
				keys.detach();
				keys.bound = false;
			}
		}

		settings.bindings.enabled = newBindsEnabled;
	}

	const newPlayBind = Shared.bindIdToAccel(gsettings.get_string(Shared.playBindKey));
	const newPrevBind = Shared.bindIdToAccel(gsettings.get_string(Shared.prevBindKey));
	const newNextBind = Shared.bindIdToAccel(gsettings.get_string(Shared.nextBindKey));

	log("cmus-status: New binds play/prev/next - " + newPlayBind + "/" + newPrevBind + "/" + newNextBind);

	if ((settings.bindings.play != newPlayBind) || (settings.bindings.prev != newPrevBind) || (settings.bindings.next != newNextBind))
	{
		settings.bindings.play = newPlayBind;
		settings.bindings.back = newPrevBind;
		settings.bindings.next = newNextBind;

		keys.detach();
		keys.bound = false;
		keys.init();
		keys.addBinding(settings.bindings.play, () => { cmus.play_action(); });
		keys.addBinding(settings.bindings.back, () => { cmus.back(); });
		keys.addBinding(settings.bindings.next, () => { cmus.next(); });
		keys.bound = true;
	}

	const newSimpleTray = gsettings.get_boolean(Shared.simpleTrayKey);
	if (newSimpleTray != settings.simpleTray)
	{
		settings.simpleTray = newSimpleTray;
		if (tray != null)
		{
			if (tray.trayed) 
			{
				tray.hide();
				tray = new trayItem;
				tray.show();
			}
		}
	}

	gsettings.set_boolean(Shared.needsUpdateKey, false);
}

// status update function
function updateStatus()
{
	cmus.updateStatus();

	if (gsettings.get_boolean(Shared.needsUpdateKey)) updateSettings();

	if (cmus.updated && settings.notification.enabled)
	{
		notification.setText(settings.format(settings.notifyFormat));
		notification.show();
		cmus.updated = false;
	}

	tray.updateStatus(cmus.state);
	switch (cmus.state)
	{
		case "off":
			tray.setCaption("cmus is off");
			tray.setTime(0, 0);
			break;
		case "stopped":
			tray.setCaption("not playing");
			tray.setTime(0, 0);
			break;
		case "paused": case "playing":
			tray.setCaption(settings.format(settings.trayFormat));
			tray.setTime(cmus.track.time, cmus.track.duration);
			break;
	}


	if (settings.updated) { notification.show(); settings.updated = false; }

	if (enabled) MainLoop.timeout_add(settings.updateIntervalMs, updateStatus);
}

// extension functions
function init() {}

function enable()
{
	gsettings = ExtUtils.getSettings(Shared.settingsSchema);

	tray = new trayItem;
	tray.show();

	enabled = true;
	updateSettings();	// updateStatus() calls updateSettings() only if settings-updated is true
				// to be sure settings are loaded, updateSettings() must be called manually
	updateStatus();
}

function disable()
{
	tray.hide();
	tray = null;

	notification.hide(notification.hideIndex);

	if (keys.bound)
	{
		keys.detach();
		keys.bound = false;
	}

	enabled = false;
	gsettings = null;
}
