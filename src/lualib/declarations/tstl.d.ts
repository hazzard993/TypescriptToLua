/** @noSelfInFile */

interface LuaClass {
    prototype: LuaObject;
    ____super?: LuaClass;
    ____getters?: { [key: string]: (self: LuaClass) => any };
    ____setters?: { [key: string]: (self: LuaClass, val: any) => void };
}

interface LuaObject {
    constructor: LuaClass;
    ____getters?: { [key: string]: (self: LuaObject) => any };
    ____setters?: { [key: string]: (self: LuaObject, val: any) => void };
}
