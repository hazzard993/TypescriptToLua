import { Expect, FocusTest, Test, TestCase } from "alsatian";
import * as fs from "fs";
import mock = require("mock-fs");
import * as ts from "typescript";
import { compile } from "../../../src/Compiler";
import { GMBuilder as gmBuilder } from "../../../src/GMBuilder";
import { GMHelper as gmHelper } from "../../../src/GMHelper";

const minimalLib = `
interface Array<T> {}
interface Boolean {}
interface Function {}
interface IArguments {}
interface Number {}
interface Object {}
interface RegExp {}
interface String {}
`;

export class ExtractorTests {

    @Test("Extract resources from a project")
    public testExtractResources(): void {
        mock({
            "index.ts": mock.file({
                content: `
                    interface Sound {}
                    interface Sprite {}
                    interface Background {}
                    interface Path {}
                    interface Shader {}
                    interface Font {}
                    interface GMObject {}
                    interface Timeline {}
                    interface Room {}
                    declare function sound_get_name(sound: Sound): string;
                    declare function sprite_get_name(sprite: Sprite): string;
                    declare function background_get_name(background: Background): string;
                    declare function path_get_name(path: Path): string;
                    declare function script_get_name(script: Function): string;
                    declare function shader_get_name(shader: Shader): string;
                    declare function font_get_name(font: Font): string;
                    declare function object_get_name(object: GMObject): string;
                    declare function timeline_get_name(timeline: Timeline): string;
                    declare function room_get_name(room: Room): string;
                    function test() {
                        sound_get_name(sound0);
                        sound_get_name(sprite0);
                        sound_get_name(background0);
                        sound_get_name(path0);
                        sound_get_name(script0);
                        sound_get_name(shader0);
                        sound_get_name(font0);
                        sound_get_name(object0);
                        sound_get_name(timeline0);
                        sound_get_name(room0);
                    }
                `,
            }),
            "lib.d.ts": mock.file({
                content: minimalLib,
            }),
            "tsconfig.json": mock.file({
                content: `
                    {
                        "compilerOptions": { "noLib": true },
                        "include": [ "*.ts" ],
                        "luaTarget": "gml",
                        "projectFile": "Test.project.gmx",
                        "extractedDefinitionsFile": "projectDefinitions.d.ts",
                        "extract": true,
                    }
                `,
            }),
        });
        const project = gmBuilder.newProject();
        project.assets.sounds[0].sound.push("sound\\sound0");
        project.assets.sprites[0].sprite.push("sprites\\sprite0");
        project.assets.backgrounds[0].background.push("background\\background0");
        project.assets.paths[0].path.push("paths\\path0");
        project.assets.scripts[0].script.push("scripts\\script0.gml");
        project.assets.shaders[0].shader.push({
            $: {
                type: "GLSL",
            },
            _: "shaders\\shader0.shader",
        });
        project.assets.fonts[0].font.push("fonts\\font0");
        project.assets.objects[0].object.push("objects\\object0");
        project.assets.timelines[0].timeline.push("timelines\\timeline0");
        project.assets.rooms[0].room.push("rooms\\room0");
        const path = "Test.project.gmx";
        gmHelper.setProjectJson(path, project);
        compile(["-p", "tsconfig.json", "--noTranspile"]);
        compile(["-p", "tsconfig.json"]);
        mock.restore();
    }

}
