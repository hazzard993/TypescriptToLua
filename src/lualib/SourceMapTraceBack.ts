// TODO: In the future, change this to __TS__RegisterFileInfo and provide tstl interface to
// get some metadata about transpilation.
function __TS__SourceMapTraceBack(this: void, luaFileName: string, sourceFileName: string, sourceMap: { [line: number]: number }): void {
    _G["__TS__sourcemap"] = _G["__TS__sourcemap"] || {};
    _G["__TS__sourcefile"] = _G["__TS__sourcefile"] || {};
    _G["__TS__sourcemap"][luaFileName] = sourceMap;
    _G["__TS__sourcefile"][luaFileName] = sourceFileName;

    if (_G.__TS__originalTraceback === undefined) {
        _G.__TS__originalTraceback = debug.traceback;
        debug.traceback = (thread, message, level) => {
            const trace = _G["__TS__originalTraceback"](thread, message, level);
            const [result] = string.gsub(trace, "(%S+).lua:(%d+)", (file, line) => {
                const errorFileName = `${file}.lua`;
                if (_G["__TS__sourcemap"][errorFileName] && _G["__TS__sourcemap"][errorFileName][line]) {
                    return `${_G["__TS__sourcefile"][errorFileName]}.ts:${_G["__TS__sourcemap"][errorFileName][line]}`;
                }
                return `${file}.lua:${line}`;
            });

            return result;
        };
    }
}
