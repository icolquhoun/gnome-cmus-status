// imports
const GLib 	= imports.gi.GLib;
const Lang 	= imports.lang;
const Main 	= imports.ui.main;
const MainLoop 	= imports.mainloop;
const Meta	= imports.gi.Meta;
const Shell 	= imports.gi.Shell;
const St	= imports.gi.St;
const Tweener	= imports.ui.tweener;

// extension settings
let settings =
{
	// formats
	trayFormat: "%a% - %t%",
	notifyFormat: "%a% - %t% (%al%)",

	// key bindings
	bindings:
	{
		play: "<alt>c",
		prev: "<alt>x",
		next: "<alt>v"
	},

	format: function(str)
	{
		return str.replace("%a%", cmus.track.artist).replace("%t%", cmus.track.title).replace("%al%", cmus.track.album);
	}
};

// key manager
let keys =
{
	bindings: [],
	callbacks: [],

	init: function()
	{
		global.display.connect("accelerator-activated", (display, action, deviceId, timestamp) =>
		{
			for (let i = 0; i < this.bindings.length; i++)
			{
				if (this.bindings[i].code == action)
				{
					this.callbacks[i]();
					break;
				}
			}
		});
	},

	addBinding: function(binding, callback)
	{
		let keyAction = global.display.grab_accelerator(binding);
		if (keyAction == Meta.KeyBindingAction.NONE)
		{
			log("cmus-status: Unable to bind " + binding);
		}
		else
		{
			let keyName = Meta.external_binding_name_for_action(keyAction);

			Main.wm.allowKeybinding(keyName, Shell.ActionMode.ALL);

			let keyCode = keyName.substring(keyName.lastIndexOf("-") + 1);

			const index = this.bindings.length;
			this.bindings[index] = 
			{
				binding: binding,
				action: keyAction,
				name: keyName,
				code: keyCode 
			};
			this.callbacks[index] = callback;

			log("cmus-status: Bound " + binding + ": name : " + keyName + "; №" + keyCode);
		}
	},

	detach: function()
	{
		for (let i = 0; i < this.bindings.length; i++)
		{
			global.display.ungrab_accelerator(this.bindings[i].action);
			Main.wm.allowKeybinding(this.bindings[i].name, Shell.ActionMode.NONE);
		}
	}
};

// notification object
let notification =
{
	vPos: 2, hPos: 2, // 1 = left/top; 2 = center; 3 = right / bottom
	fadeStartTime: 2, fadeDuration: 5,
	hideIndex: 0,
	actor: null,
	offset: 10, // notification offset
	notification_text: "TEST",
	
	show: function() // show notifiaction
	{
		this.hide(this.hideIndex);

		if (!this.actor)
		{
			this.actor = new St.Label({ style_class: "popup-label", text: this.notification_text });
			Main.uiGroup.add_actor(this.actor);
		}
		this.actor.opacity = 255;

		let monitor = Main.layoutManager.primaryMonitor;

		// calculate notification position
		let posX = 0;
		if (this.hPos == 0) posX = this.offset;
		if (this.hPos == 1) posX = monitor.x + Math.floor(monitor.width / 2 - this.actor.width / 2);
		if (this.hPos == 2) posX = monitor.x + monitor.width - this.actor.width - this.offset;

		let posY = 0;
		if (this.vPos == 0) posY = this.offset;
		if (this.vPos == 1) posY = monitor.y + Math.floor(monitor.height / 2 - this.actor.height / 2);
		if (this.vPos == 2) posY = monitor.y + monitor.height - this.actor.height - this.offset;

		this.actor.set_position(posX, posY);

		this.hideIndex++;

		const current = this.hideIndex;

		// set hide timeout
		MainLoop.timeout_add_seconds(this.fadeStartTime, () =>
		{
			Tweener.addTween(this.actor, 
						{ 
							opacity: 0, 
							time: this.fadeDuration, 
							traansition: "easeOutQuad",
							onComplete: () => { this.hide(current); }
						});
		});
	},

	hide: function(index) // hide notification
	{
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

// tray ui
let tray =
{
	main_box: null, 
	prev_button: null, button: null, next_button: null,
	status_label: null, status_icon: null,
	trayed: false,
	caption: "tray label",

	init: function() // tray initialization
	{
		this.main_box = new St.BoxLayout();

		this.button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						x_fill: true,
						y_fill: false,
						track_hover: true });

		let box = new St.BoxLayout();

		this.status_label = new St.Label({ style_class: "tray-label", text: this.caption });
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
						x_fill: true,
						y_fill: false,
						track_hover: true });
		let prev_icon = new St.Icon({ icon_name: "media-skip-forward-symbolic-rtl",
						style_class: "system-status-icon" });

		this.prev_button.set_child(prev_icon);
		this.prev_button.connect("button-press-event", () =>
		{
			cmus.back();
		});

		this.next_button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						x_fill: true,
						y_fill: false,
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
	},

	show: function()
	{
		if (!this.trayed)
		{
			this.trayed = true;
			Main.panel._rightBox.insert_child_at_index(this.main_box, 0);
		}
	},

	hide: function()
	{
		if (this.trayed)
		{
			this.trayed = false;
			Main.panel._rightBox.remove_child(this.main_box);
		}
	}, 

	setCaption: function(newCaption)
	{
		this.caption = newCaption;

		if (this.status_label) this.status_label.text = newCaption;
	},

	updateStatus: function(newStatus)
	{
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
	}
};

// cmus controller
let cmus =
{
	state: "off",
	track: { title: "title", album: "album", artist: "artist" },
	updated: false,

	updateStatus: function()
	{
		const std = GLib.spawn_command_line_sync("cmus-remote -Q");
		if (std[2].toString() != "") // check if theere are any errors. If cmus is off, stderr is also not empty
		{
			this.state = "off";
			this.track = { title: "title", album: "album", artist: "artist" };
		}
		else
		{
			// resolve rcieved data
			const stdout = std[1].toString().replace(/\'/g, "\\\`");

			// get cmus status
			this.state = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"status \" | sed \"s/status\\s*//g\"'")[1].toString().replace("\n", "");

			if (this.state == "stopped")
			{
				this.track = { title: "title", album: "album", artist: "artist" };
			}
			else
			{
				// get track info
				const title = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag title \" | sed \"s/tag\\stitle\\s*//g\"'")[1].toString().replace("\n", "");
				const album = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag album \" | sed \"s/tag\\salbum\\s*//g\"'")[1].toString().replace("\n", "");
				const artist = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag artist \" | sed \"s/tag\\sartist\\s*//g\"'")[1].toString().replace("\n", "");

				if ((this.track.title != title) || (this.track.album != album) || (this.track.artist != artist))
				{
					this.track.title = title;
					this.track.album = album;
					this.track.artist = artist;

					this.updated = true;
				}
			}
		}
	},

	play: function()
	{
		GLib.spawn_command_line_sync("cmus-remote -p");
	},

	pause: function()
	{
		GLib.spawn_command_line_sync("cmus-remote -u");
	},

	launch: function()
	{
		const terminal = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec | sed \\\"s/'//g\\\"\"")[1].toString().replace("/n", "");
		const arg = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec-arg | sed \\\"s/'//g\\\"\"")[1].toString().replace("/n", "");
		GLib.spawn_command_line_sync(terminal + " " + arg + " cmus");
	},

	back: function()
	{
		GLib.spawn_command_line_sync("cmus-remote -r");
	},

	next: function()
	{
		GLib.spawn_command_line_sync("cmus-remote -n");
	},

	play_action: function()
	{
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
	}
};

// status update function
function updateStatus()
{
	cmus.updateStatus();

	if (cmus.updated)
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
			break;
		case "stopped":
			tray.setCaption("not playing");
			break;
		case "paused": case "playing":
			tray.setCaption(settings.format(settings.trayFormat));
			break;
	}

	MainLoop.timeout_add(250, updateStatus);
}

// extension functions
function init()
{
	tray.init();
	keys.init();
}

function enable()
{
	keys.addBinding("<alt>c", () => { cmus.play_action(); });
	keys.addBinding("<alt>x", () => { cmus.back(); });
	keys.addBinding("<alt>v", () => { cmus.next(); });

	tray.show();

	updateStatus();
}

function disable()
{
	tray.hide();
	notification.hide(notification.hideIndex);

	keys.detach();
}
