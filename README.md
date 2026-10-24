# freetube-tv
This is a free YoutubeTV "emulation" that works by tricking youtube web interface into thinking that its running on a smart TV.

This is mostly useful if you want to play stuff from youtube on your computer, and then *leanback* and use your Android/iOS youtube app as a remote.

This fork is configured to keep playing after screen has been disconnected (for playing music on a remote Mac).

## Contributing
Check for open issues and open a PR to fix those, or just open issues with suggestions and/or feedback.

## Build and Run

Requires **Node.js >= 22.12.0** and **pnpm**.

To run this project in your machine, follow these simple steps: 
* Run `pnpm install` to install all project dependencies
* Run `pnpm start` to build and run the application in your machine
* Run `pnpm test` (unit tests) and `pnpm test:electron` (Electron integration tests) to verify the application

### Dependency Updates & Supply-Chain Security
Dependencies are managed with `pnpm` and updated weekly via Dependabot. Both `pnpm` (`minimumReleaseAge: 4320` in `pnpm-workspace.yaml`) and Dependabot (`cooldown: default-days: 3` in `.github/dependabot.yml`) enforce a **3-day cooldown period** for newly published package versions before they can be installed or proposed in pull requests.

## LICENSE
MIT

(forked from [fa7ad/freetube-tv](https://github.com/fa7ad/freetube-tv))
