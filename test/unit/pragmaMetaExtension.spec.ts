import { Expect, Test } from "alsatian";
import * as util from "../src/util";

import { TranspileError } from "../../src/Errors";

export class PragmaMetaExtension {

    @Test("MetaExtension")
    public metaExtension(): void {
        // Transpile
        const lua = util.transpileString(
            `
            declare class _LOADED;
            declare namespace debug {
                function getregistry(): any;
            }
            /** @metaExtension */
            class LoadedExt extends _LOADED {
                public static test() {
                    return 5;
                }
            }
            return debug.getregistry()["_LOADED"].test();
            `
        );
        const result = util.executeLua(lua);
        // Assert
        Expect(result).toBe(5);
    }

    @Test("IncorrectUsage")
    public incorrectUsage(): void {
        Expect(() => {
            util.transpileString(
                `
                /** @metaExtension */
                class LoadedExt {
                    public static test() {
                        return 5;
                    }
                }
                `
            );
        }).toThrowError(TranspileError,
                        "@metaExtension requires the extension of the metatable class.");
    }

    @Test("DontAllowInstantiation")
    public dontAllowInstantiation(): void {
        Expect(() => {
            util.transpileString(
                `
                declare class _LOADED;
                /** @metaExtension */
                class Ext extends _LOADED {
                }
                const e = new Ext();
                `
            );
        }).toThrowError(TranspileError,
                        "Cannot construct classes with pragma '@extension' or '@metaExtension'.");
    }
}
