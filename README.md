# JinProto Mono webfonts

WOFF2 builds and a bilingual specimen for **JinProto Mono v0.2**, combining
0xProto Latin with Tsanger JinKai 04 Chinese. Regular (400) and Bold (700)
use a fixed grid: Latin occupies one cell and Chinese occupies two.

[View the specimen](https://hanlhe.github.io/JinProto-Mono-Webfonts/).

## Use

```html
<link rel="stylesheet" href="https://hanlhe.github.io/JinProto-Mono-Webfonts/JinProtoMono.css">
```

```css
body {
  font-family: "JinProto Mono", monospace;
  font-weight: 400;
  font-synthesis: none;
}
```

Use weight 700 for Bold. Contextual programming ligatures are included.

This public repository contains the generated webfonts and preview. Build
sources remain in the separate private font repository. The specimen follows
the layout of [JinGleya Sans](https://hanlhe.github.io/JinGleya-Sans-Webfonts/).

This is a personal font build. Original font notices are preserved in the
WOFF2 metadata and [FONT-NOTICES.txt](FONT-NOTICES.txt). This repository does
not grant additional permissions for the source fonts.
