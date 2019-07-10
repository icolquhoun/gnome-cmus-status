const Gtk 	= imports.gi.Gtk;
const Lang 	= imports.lang;
const MainLoop	= imports.mainloop;
const Me	= imports.misc.extensionUtils.getCurrentExtension();

const Shared 	= Me.imports.shared;

let gsettings = null;

let prefs =
{
	settings: null,
	builder: null,
	form: null,

	np: // notification properties
	{
		enabled: true,
		x: 2, y: 2
	},

	binds:
	{
		enabled: true
	},

	widgets:
	{
		apply: null,
		updateInterval: null,
		updateIntervalAdj: null,
		enableBinds: null,
		playBind: null,
		prevBind: null,
		nextBind: null,
		simpleTray: null,
		trayFormat: null,
		notFormat: null,
		enableNot: null,
		notFadeStart: null,
		notFadeStartAdj: null,
		notFadeDuration: null,
		notPosition:
		{
			b00: null, b10: null, b20: null,
			b01: null, b11: null, b21: null,
			b02: null, b12: null, b22: null
		},
		infoLabel: null

	},

	init: function()
	{
		this.builder = new Gtk.Builder();
		this.builder.add_from_file(Me.path + "/schemas/prefs.ui");
		this.form = this.builder.get_object("window");

		// load widgets
		this.widgets.apply = this.builder.get_object("pref_apply");
		this.widgets.updateInterval = this.builder.get_object("pref_tick_interval");
		this.widgets.updateIntervalAdj = this.builder.get_object("pref_tick_interval_adj");
		this.widgets.enableBinds = this.builder.get_object("pref_enable_binds");
		this.widgets.playBind = this.builder.get_object("pref_play_bind");
		this.widgets.prevBind = this.builder.get_object("pref_prev_bind");
		this.widgets.nextBind = this.builder.get_object("pref_next_bind");
		this.widgets.simpleTray = this.builder.get_object("pref_simple_tray");
		this.widgets.trayFormat = this.builder.get_object("pref_tray_format");
		this.widgets.notFormat = this.builder.get_object("pref_notification_format");
		this.widgets.enableNot = this.builder.get_object("pref_enable_notifications");
		this.widgets.notFadeStart = this.builder.get_object("pref_notification_fade_time");
		this.widgets.notFadeStartAdj = this.builder.get_object("pref_notification_fade_start_adj");
		this.widgets.notFadeDuration = this.builder.get_object("pref_notification_fade_duration");
		this.widgets.notFadeDurationAdj = this.builder.get_object("pref_notification_fade_duration_adj");
		this.widgets.infoLabel = this.builder.get_object("info_label");

		this.widgets.infoLabel.set_label(Me.metadata.name + " version " + Me.metadata.version);

		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
		{
			this.widgets.notPosition["b" + i + j] = this.builder.get_object("pref_np_" + i + j);
		}

		// connect events
		this.widgets.apply.connect("clicked", (widget) =>
		{
			const bindsEnabled = this.widgets.enableBinds.get_active();
			const notEnabled = this.widgets.enableNot.get_active();
			const simpleTray = this.widgets.simpleTray.get_active();

			gsettings.set_boolean(Shared.enableBindsKey, bindsEnabled);
			gsettings.set_boolean(Shared.enableNotKey, notEnabled);
			gsettings.set_boolean(Shared.simpleTrayKey, simpleTray);
			gsettings.set_int(Shared.notPosXKey, this.np.x);
			gsettings.set_int(Shared.notPosYKey, this.np.y);

			gsettings.set_int(Shared.notFadeStartKey, this.widgets.notFadeStartAdj.get_value());
			gsettings.set_int(Shared.notFadeDurationKey, this.widgets.notFadeDurationAdj.get_value());

			gsettings.set_int(Shared.updateIntervalKey, this.widgets.updateIntervalAdj.get_value());

			gsettings.set_string(Shared.trayFormatKey, this.widgets.trayFormat.get_text());
			gsettings.set_string(Shared.notFormatKey, this.widgets.notFormat.get_text());

			gsettings.set_string(Shared.playBindKey, this.widgets.playBind.get_active_id());
			gsettings.set_string(Shared.prevBindKey, this.widgets.prevBind.get_active_id());
			gsettings.set_string(Shared.nextBindKey, this.widgets.nextBind.get_active_id());

			gsettings.set_boolean(Shared.needsUpdateKey, true);
		});

		this.widgets.enableBinds.connect("toggled", (widget) =>
		{
			this.invalidateEnabled(true, false);
		});

		this.widgets.simpleTray.connect("toggled", (widget) =>
		{
			if (widget.get_active()) widget.set_label("Tray: control buttons");
			else widget.set_label("Tray: opens popup");
		});

		this.widgets.enableNot.connect("toggled", (widget) =>
		{
			this.invalidateEnabled(false, true);
		});

		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
		{
			let i0 = i;
			let j0 = j;

			this.widgets.notPosition["b" + i + j].connect("toggled", (widget) =>
			{
				if (this.widgets.enableNot.get_active())
				{
					this.widgets.notPosition["b" + this.np.x + this.np.y].set_sensitive(true);
					widget.set_sensitive(false);
						
					this.np.x = i0;
					this.np.y = j0;
				}
				
				widget.set_active(false);
			});
		}
	},

	// enabled/disables groups of widgets
	invalidateEnabled: function(binds, notifications)
	{
		if (binds)
		{
			const bindsEnabled = this.widgets.enableBinds.get_active();

			this.binds.enabled = true;

			if (bindsEnabled) this.widgets.enableBinds.set_label("Keybindings enabled");
			else this.widgets.enableBinds.set_label("Keybindings disabled");

			this.widgets.playBind.set_sensitive(bindsEnabled);
			this.widgets.prevBind.set_sensitive(bindsEnabled);
			this.widgets.nextBind.set_sensitive(bindsEnabled);
		}

		if (notifications)
		{
			const notEnabled = this.widgets.enableNot.get_active();

			this.np.enabled = notEnabled;

			if (notEnabled) this.widgets.enableNot.set_label("On-screen notifications enabled");
			else this.widgets.enableNot.set_label("On-screen notifications disabled");

			this.widgets.notFadeStart.set_sensitive(notEnabled);
			this.widgets.notFadeDuration.set_sensitive(notEnabled);

			for (let i = 0; i < 3; i++)
				for (let j = 0; j < 3; j++)
				{
					if ((i != this.np.x) || (j != this.np.y)) this.widgets.notPosition["b" + i + j].set_sensitive(notEnabled);
					else this.widgets.notPosition["b" + i + j].set_sensitive(!notEnabled);
				}
		}
	},

	loadPrefs: function()
	{
		this.np.x = gsettings.get_int(Shared.notPosXKey);
		this.np.y = gsettings.get_int(Shared.notPosYKey);

		this.widgets.enableBinds.set_active(gsettings.get_boolean(Shared.enableBindsKey));
		this.widgets.simpleTray.set_active(gsettings.get_boolean(Shared.simpleTrayKey));
		if (this.widgets.simpleTray.get_active()) this.widgets.simpleTray.set_label("Tray: control buttons");
		else this.widgets.simpleTray.set_label("Tray: opens popup");
		this.widgets.enableNot.set_active(gsettings.get_boolean(Shared.enableNotKey));

		this.widgets.notFadeStartAdj.set_value(gsettings.get_int(Shared.notFadeStartKey));
		this.widgets.notFadeDurationAdj.set_value(gsettings.get_int(Shared.notFadeDurationKey));

		this.widgets.updateIntervalAdj.set_value(gsettings.get_int(Shared.updateIntervalKey));

		this.widgets.trayFormat.set_text(gsettings.get_string(Shared.trayFormatKey));
		this.widgets.notFormat.set_text(gsettings.get_string(Shared.notFormatKey));

		this.invalidateEnabled(true, true);

		this.widgets.playBind.set_active_id(gsettings.get_string(Shared.playBindKey));
		this.widgets.prevBind.set_active_id(gsettings.get_string(Shared.prevBindKey));
		this.widgets.nextBind.set_active_id(gsettings.get_string(Shared.nextBindKey));
	}
};

function init()
{
	gsettings = Shared.getSettings(Shared.settingsSchema);
}

function buildPrefsWidget()
{
	prefs.init();
	prefs.form.show_all();
	prefs.loadPrefs();
	return prefs.form;
}
