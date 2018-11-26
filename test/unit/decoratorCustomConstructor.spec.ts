import { Expect, Test, TestCase } from "alsatian";
import * as util from "../src/util";

import { TranspileError } from "../../src/Errors";

export class DecoratorCustomConstructor {

    @Test("CustomCreate")
    public customCreate(): void {
        // Transpile
        const lua = util.transpileString(
            `/** @customConstructor Point2DCreate */
            class Point2D {
                x: number;
                y: number;
            }
            function Point2DCreate(x: number, y: number) {
                return {x: x, y: y};
            }
            return new Point2D(1, 2).x;
            `
        );
        const result = util.executeLua(lua);
        // Assert
        Expect(result).toBe(1);
    }

    @Test("IncorrectUsage")
    public incorrectUsage(): void {
        Expect(() => {
            util.transpileString(
                `/** @customConstructor */
                class Point2D {
                    x: number;
                    y: number;
                }
                return new Point2D(1, 2).x;
                `
            );
        }).toThrowError(TranspileError, "@customConstructor expects 1 argument(s) but got 0.");
    }
}
