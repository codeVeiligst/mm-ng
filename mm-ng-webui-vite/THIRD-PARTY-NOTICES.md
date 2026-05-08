# Third-party notices

`mm-ng-webui-vite` is licensed under the Apache License, Version 2.0.

The production WebUI bundle includes code from the following installed runtime
packages. License metadata is taken from `package-lock.json` and the installed
package manifests.

| Package | Version | License |
| --- | --- | --- |
| `@kurkle/color` | 0.3.4 | MIT |
| `@tanstack/query-core` | 5.100.9 | MIT |
| `@tanstack/react-query` | 5.100.9 | MIT |
| `chart.js` | 4.5.1 | MIT |
| `cookie` | 1.1.1 | MIT |
| `react` | 19.2.5 | MIT |
| `react-dom` | 19.2.5 | MIT |
| `react-router` | 7.15.0 | MIT |
| `scheduler` | 0.27.0 | MIT |
| `set-cookie-parser` | 2.7.2 | MIT |

Build-only dependencies are used to produce the static bundle and are not copied
into the production nginx image. The complete dependency metadata is recorded in
`package-lock.json`.
