install:
	sudo cp cmus-status@yagreg7.gmail.com/schemas/org.gnome.shell.extensions.cmus-status.gschema.xml /usr/share/glib-2.0/schemas/
	sudo glib-compile-schemas /usr/share/glib-2.0/schemas/
	-rm -rf ~/.local/share/gnome-shell/extensions/cmus-status@yagreg7.gmail.com
	cp -R cmus-status@yagreg7.gmail.com ~/.local/share/gnome-shell/extensions/
	-gnome-shell-extension-tool -e cmus.status@yagreg7.gmail.com
zip:
	zip -rj gnome-cmus-status.zip cmus.status@yagreg7.gmail.com -x *.sw* -x *old-extension.js
