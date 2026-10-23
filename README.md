# freetube-tv
This is a free YoutubeTV "emulation" that works by tricking youtube web interface into thinking that its running on a smart TV.

This is mostly useful if you want to play stuff from youtube on your computer, and then *leanback* and use your Android/iOS youtube app as a remote.

This fork is configured to keep playing after screen has been disconnected (for playing music on a remote Mac).

## Contributing
Check for open issues and open a PR to fix those, or just open issues with suggestions and/or feedback.

## Build and Run

To run this project in your machine, follow these simple steps: 
* Run `npm install` or `yarn install` to install all project dependencies
* Run `npm start` or `yarn start` to build and run the application in your machine

If `yarn` is not installed globally, you can use the Yarn binary bundled in the repository directly via Node.js:
* Install dependencies: `node .yarn/releases/yarn-4.0.2.cjs install`
* Start the application: `node .yarn/releases/yarn-4.0.2.cjs start`

## LICENSE
MIT

(forked from [fa7ad/freetube-tv](https://github.com/fa7ad/freetube-tv))
