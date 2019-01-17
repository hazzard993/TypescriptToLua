import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

import { CompilerOptions } from "./CompilerOptions";
import { GMHelper as gmHelper } from "./GMHelper";

export function extractGMDefinitions(projectFilePath: string, options: CompilerOptions): void {
    const project = gmHelper.getProjectJson(projectFilePath);
    const bindingFilePath = path.join(path.dirname(projectFilePath), "bindings.json");
    const bindings = fs.existsSync(bindingFilePath) && JSON.parse(fs.readFileSync(bindingFilePath, "utf8"));
    const outFile = options.extractedDefinitionsFile || "project.d.ts";
    let content = "";
    const addResource = (resourcePath: string, outString: string) => {
        const folderName = resourcePath.split(/\\/)[0];
        let bindingPath = path.join(path.dirname(projectFilePath), folderName, path.basename(resourcePath));
        switch (folderName) {
            case "objects":
                bindingPath = `${bindingPath}.object.gmx`;
            case "rooms":
                bindingPath = `${bindingPath}.room.gmx`;
        }
        // Is the path within the bindings? Likely already defined
        if ((bindings && bindings.indexOf(bindingPath) === -1) || !bindings) {
            content += `${outString}\n`;
        }
    };
    if (project.assets.sprites[0].sprite) {
        for (const spriteResourcePath of project.assets.sprites[0].sprite) {
            const spriteName = path.basename(spriteResourcePath);
            addResource(spriteResourcePath, `declare const ${spriteName}: Sprite;`);
        }
    }
    if (project.assets.sounds[0].sound) {
        for (const soundResourcePath of project.assets.sounds[0].sound) {
            const soundName = path.basename(soundResourcePath);
            addResource(soundResourcePath, `declare const ${soundName}: Sound;`);
        }
    }
    if (project.assets.backgrounds[0].background) {
        for (const backgroundResourcePath of project.assets.backgrounds[0].background) {
            const backgroundName = path.basename(backgroundResourcePath);
            addResource(backgroundResourcePath, `declare const ${backgroundName}: Background;`);
        }
    }
    if (project.assets.paths[0].path) {
        for (const pathResourcePath of project.assets.paths[0].path) {
            const pathName = path.basename(pathResourcePath);
            addResource(pathResourcePath, `declare const ${pathName}: Path;`);
        }
    }
    if (project.assets.scripts[0].script) {
        for (const scriptResourcePath of project.assets.scripts[0].script) {
            const functionName = path.basename(scriptResourcePath, ".gml");
            addResource(scriptResourcePath, `declare const ${functionName}: Function;`);
        }
    }
    if (project.assets.shaders[0].shader) {
        for (const shader of project.assets.shaders[0].shader) {
            const shaderName = path.basename(shader._, ".shader");
            addResource(shader._, `declare const ${shaderName}: Shader;`);
        }
    }
    if (project.assets.fonts[0].font) {
        for (const fontResourcePath of project.assets.fonts[0].font) {
            const fontName = path.basename(fontResourcePath);
            addResource(fontResourcePath, `declare const ${fontName}: Font;`);
        }
    }
    if (project.assets.timelines[0].timeline) {
        for (const timelineResourcePath of project.assets.timelines[0].timeline) {
            const timelineName = path.basename(timelineResourcePath);
            addResource(timelineResourcePath, `declare const ${timelineName}: Timeline;`);
        }
    }
    if (project.assets.objects[0].object) {
        for (const objectResourcePath of project.assets.objects[0].object) {
            const objectName = path.basename(objectResourcePath);
            addResource(objectResourcePath, `declare const ${objectName}: GMObject;`);
        }
    }
    if (project.assets.rooms[0].room) {
        for (const roomResourcePath of project.assets.rooms[0].room) {
            const roomName = path.basename(roomResourcePath);
            addResource(roomResourcePath, `declare const ${roomName}: Room;`);
        }
    }
    ts.sys.writeFile(outFile, content);
}
