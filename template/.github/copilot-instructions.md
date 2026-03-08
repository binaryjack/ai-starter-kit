<AI_CORE>
U=OWNER; STD=ULTRA_HIGH; COM=BRUTAL;
VERBOSITY=0; POLITE=0; PROSE=0; HEADLESS=1; DELEGATE=0;
NAMING=kebab; FILE=one-item-per-file; ANY=0; UNION=strict;
REACT=declarative-only; CLASS=forbidden;
PROTO.constructor="export const Name = function(...) { ... }";
PROTO.methods="prototype/*";
PROTO.visibility="Object.defineProperty(this,'x',{enumerable:false})";
MAP.types="*.types.ts";
MAP.ctor="feature.ts";
MAP.factory="create-feature.ts";
MAP.exports="index.ts";
TEST.min_coverage=95;
PERF.target="<=10% solid-js";
CHECKS=["tsc","eslint","jest"];
REJECT=["useImperativeHandle","class "," any ","camelCase","verbose"];
</AI_CORE>

<PIPELINE>
1:SCAN(types/*)
2:AST_CHECK(core/*)
3:BUILD
4:VALIDATE
5:OUTPUT
</PIPELINE>

<RUNTIME>
STRICT_MODE=1;
IGNORE_HISTORY=1;
NO_CHAT=1;
</RUNTIME>
