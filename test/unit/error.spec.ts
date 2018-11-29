import { Expect, Test, TestCase } from "alsatian";
import * as util from "../src/util";

import { TranspileError } from "../../src/Errors";

export class LuaErrorTests {

    @Test("throwString")
    public trowString(): void {
        // Transpile
        const lua = util.transpileString(
            `throw "Some Error"`
        );
        // Assert
        Expect(lua).toBe(`error("Some Error");`);
    }

    @Test("throwError")
    public throwError(): void {
        // Transpile & Asser
        Expect(() => {
            const lua = util.transpileString(
                `throw Error("Some Error")`
            );
        }).toThrowError(TranspileError, "Invalid throw expression, only strings can be thrown.");
    }

    @TestCase(0, "A")
    @TestCase(1, "B")
    @TestCase(2, "C")
    @Test("re-throw")
    public reThrow(i: number, expected: any): void {
        const source =
            `const i = ${i};
            function foo() {
                try {
                    try {
                        if (i === 0) { throw "z"; }
                    } catch (e) {
                        throw "a";
                    } finally {
                        if (i === 1) { throw "b"; }
                    }
                } catch (e) {
                    throw (e as string).toUpperCase();
                } finally {
                    throw "C";
                }
            }
            let result = "x";
            try {
                foo();
            } catch (e) {
                result = (e as string)[(e as string).length - 1];
            }
            return result;`;
        const result = util.transpileAndExecute(source);
        Expect(result).toBe(expected);
    }

    @TestCase("return", "return", "return", "return", "finally", false)
    @TestCase("return", "return", "return", "throw", "finally", false)
    @TestCase("return", "return", "return", "//", "finally", false)
    @TestCase("return", "return", "throw", "return", "finally", true)
    @TestCase("return", "return", "throw", "throw", "finally", true)
    @TestCase("return", "return", "throw", "//", "finally", true)
    @TestCase("return", "return", "//", "return", "try", false)
    @TestCase("return", "return", "//", "throw", "try", false)
    @TestCase("return", "return", "//", "//", "try", false)
    @TestCase("return", "throw", "return", "return", "finally", false)
    @TestCase("return", "throw", "return", "throw", "finally", false)
    @TestCase("return", "throw", "return", "//", "finally", false)
    @TestCase("return", "throw", "throw", "return", "finally", true)
    @TestCase("return", "throw", "throw", "throw", "finally", true)
    @TestCase("return", "throw", "throw", "//", "finally", true)
    @TestCase("return", "throw", "//", "return", "try", false)
    @TestCase("return", "throw", "//", "throw", "try", false)
    @TestCase("return", "throw", "//", "//", "try", false)
    @TestCase("return", "//", "return", "return", "finally", false)
    @TestCase("return", "//", "return", "throw", "finally", false)
    @TestCase("return", "//", "return", "//", "finally", false)
    @TestCase("return", "//", "throw", "return", "finally", true)
    @TestCase("return", "//", "throw", "throw", "finally", true)
    @TestCase("return", "//", "throw", "//", "finally", true)
    @TestCase("return", "//", "//", "return", "try", false)
    @TestCase("return", "//", "//", "throw", "try", false)
    @TestCase("return", "//", "//", "//", "try", false)
    @TestCase("throw", "return", "return", "return", "finally", false)
    @TestCase("throw", "return", "return", "throw", "finally", false)
    @TestCase("throw", "return", "return", "//", "finally", false)
    @TestCase("throw", "return", "throw", "return", "finally", true)
    @TestCase("throw", "return", "throw", "throw", "finally", true)
    @TestCase("throw", "return", "throw", "//", "finally", true)
    @TestCase("throw", "return", "//", "return", "catch", false)
    @TestCase("throw", "return", "//", "throw", "catch", false)
    @TestCase("throw", "return", "//", "//", "catch", false)
    @TestCase("throw", "throw", "return", "return", "finally", false)
    @TestCase("throw", "throw", "return", "throw", "finally", false)
    @TestCase("throw", "throw", "return", "//", "finally", false)
    @TestCase("throw", "throw", "throw", "return", "finally", true)
    @TestCase("throw", "throw", "throw", "throw", "finally", true)
    @TestCase("throw", "throw", "throw", "//", "finally", true)
    @TestCase("throw", "throw", "//", "return", "catch", true)
    @TestCase("throw", "throw", "//", "throw", "catch", true)
    @TestCase("throw", "throw", "//", "//", "catch", true)
    @TestCase("throw", "//", "return", "return", "finally", false)
    @TestCase("throw", "//", "return", "throw", "finally", false)
    @TestCase("throw", "//", "return", "//", "finally", false)
    @TestCase("throw", "//", "throw", "return", "finally", true)
    @TestCase("throw", "//", "throw", "throw", "finally", true)
    @TestCase("throw", "//", "throw", "//", "finally", true)
    @TestCase("throw", "//", "//", "return", "end", false)
    @TestCase("throw", "//", "//", "throw", "end", true)
    @TestCase("throw", "//", "//", "//", null, false)
    @TestCase("//", "return", "return", "return", "finally", false)
    @TestCase("//", "return", "return", "throw", "finally", false)
    @TestCase("//", "return", "return", "//", "finally", false)
    @TestCase("//", "return", "throw", "return", "finally", true)
    @TestCase("//", "return", "throw", "throw", "finally", true)
    @TestCase("//", "return", "throw", "//", "finally", true)
    @TestCase("//", "return", "//", "return", "end", false)
    @TestCase("//", "return", "//", "throw", "end", true)
    @TestCase("//", "return", "//", "//", null, false)
    @TestCase("//", "throw", "return", "return", "finally", false)
    @TestCase("//", "throw", "return", "throw", "finally", false)
    @TestCase("//", "throw", "return", "//", "finally", false)
    @TestCase("//", "throw", "throw", "return", "finally", true)
    @TestCase("//", "throw", "throw", "throw", "finally", true)
    @TestCase("//", "throw", "throw", "//", "finally", true)
    @TestCase("//", "throw", "//", "return", "end", false)
    @TestCase("//", "throw", "//", "throw", "end", true)
    @TestCase("//", "throw", "//", "//", null, false)
    @TestCase("//", "//", "return", "return", "finally", false)
    @TestCase("//", "//", "return", "throw", "finally", false)
    @TestCase("//", "//", "return", "//", "finally", false)
    @TestCase("//", "//", "throw", "return", "finally", true)
    @TestCase("//", "//", "throw", "throw", "finally", true)
    @TestCase("//", "//", "throw", "//", "finally", true)
    @TestCase("//", "//", "//", "return", "end", false)
    @TestCase("//", "//", "//", "throw", "end", true)
    @TestCase("//", "//", "//", "//", null, false)
    @Test("try/catch/finally equivilence")
    public tryCatchFinallyNodeEquivalent(
            tryStmt: string,
            catchStmt: string,
            finallyStmt: string,
            endStmt: string,
            njsResult: string,
            njsErrored: boolean): void {
        const block =
            `function x() {
                try {
                    ${tryStmt} "try";
                } catch (e) {
                    ${catchStmt} "catch";
                } finally {
                    ${finallyStmt} "finally";
                }
                ${endStmt} "end";
            }
            return x();`;
        if (njsErrored) {
            Expect(() => util.transpileAndExecute(block)).toThrow();
        } else {
            const result = util.transpileAndExecute(block);
            Expect(result).toBe(njsResult);
        }
    }

    @Test("re-throw (no catch var)")
    public reThrowWithoutCatchVar(): void {
        const source =
            `let result = "x";
            try {
                try {
                    throw "y";
                } catch {
                    throw "z";
                }
            } catch (e) {
                result = (e as string)[(e as string).length - 1];
            }
            return result;`;
        const result = util.transpileAndExecute(source);
        Expect(result).toBe("z");
    }
}
