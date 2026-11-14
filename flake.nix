{
  description = "IceXIV homepage — Notist SSG";

  inputs = {
    notist.url = "github:AzurIce/notist";
    nixpkgs.follows = "notist/nixpkgs";
    flake-utils.follows = "notist/flake-utils";
  };

  outputs = { nixpkgs, notist, flake-utils, ... }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        notistPackage = notist.packages.${system}.default;
        siteSource = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = pkgs.lib.fileset.unions [
            ./Notist.toml
            ./content
            ./templates
            ./static
            ./data
            ./scripts
          ];
        };
        mkSite = target: pkgs.runCommand "icexiv-site-${target}" {
          nativeBuildInputs = [ notistPackage pkgs.python3 ];
          SITE_TARGET = target;
        } ''
          cp -r ${siteSource}/. .
          chmod -R u+w .
          notist build -j 2
          mkdir -p "$out"
          cp -r dist/. "$out/"
        '';
      in {
        packages = {
          notist = notistPackage;
          default = mkSite "global";
          cn = mkSite "cn";
        };
        apps.notist = {
          type = "app";
          program = "${notistPackage}/bin/notist";
          meta.description = "Notist static site generator";
        };
        devShells.default = pkgs.mkShell {
          packages = [ notistPackage pkgs.python3 pkgs.nodejs ];
        };
      });
}
