{pkgs}: {
  deps = [
    pkgs.libdrm
    pkgs.chromium
    pkgs.xorg.libxcb
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.pango
    pkgs.mesa
    pkgs.gtk3
    pkgs.glib
    pkgs.fontconfig
    pkgs.expat
    pkgs.dbus
    pkgs.cups
    pkgs.cairo
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.alsa-lib
    pkgs.nspr
    pkgs.nss
  ];
}
