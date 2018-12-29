import fs = require("fs");
import path = require("path");
import ts = require("typescript");
import xml2js = require("xml2js");
import { GmlError } from "./Errors";
import * as gm from "./GMResources";
import { Project } from "./GMResources";
import { ObjectFile, OutputFile, RoomFile, ScriptFile } from "./targets/Transpiler.GML";

export class GMHelper {

    /**
     * Returns the project file's content in JSON format.
     * @param projectFilePath The path to the .project.gmx file
     */
    public static getProjectJson(projectFilePath: string): gm.Project {
        const content = ts.sys.readFile(projectFilePath, "utf8");
        let resultJson: object;
        xml2js.parseString(content, (err, project) => {
            resultJson = project;
        });
        return resultJson as gm.Project;
    }

    /**
     * Updates the project file with the specified json.
     * Converts that json to xml with xml2js.
     * @param projectFilePath The path to the project file
     * @param json The project file's new contents
     */
    public static setProjectJson(projectFilePath: string, json: gm.Project): void {
        const builder = new xml2js.Builder();
        ts.sys.writeFile(projectFilePath, builder.buildObject(json));
    }

    /**
     * Throws an error if the project.gmx file and the file itself is not valid for Game Maker to use
     * @param relativeResourcePath The resource path, relative to the project's parent directory path
     * @param projectFilePath The path to the project file that should reference the resource
     * @throws GmlError if the specified resource is invalid
     * @example
     * validateResource("scripts\\test.gml", "proj.project.gmx");
     */
    public static validateResource(relativeResourcePath: string, projectFilePath: string): void {
        const project = this.getProjectJson(projectFilePath);
        const resourceParentFolder = relativeResourcePath.split(/\\/)[0];
        const fullResourcePath = path.join(path.dirname(projectFilePath), relativeResourcePath);
        if (!ts.sys.fileExists(fullResourcePath)) {
            throw new GmlError(`File not found, ${fullResourcePath}`);
        }
        let resourceName = relativeResourcePath;
        switch (resourceParentFolder) {
            case "scripts":
                if (!project.assets.scripts[0].script
                    || project.assets.scripts[0].script.indexOf(resourceName) === -1) {
                    throw new GmlError(`Resource ${resourceName} not referenced in ${projectFilePath}`);
                }
                break;
            case "objects":
                resourceName = resourceName.replace(".object.gmx", "");
                if (!project.assets.objects[0].object
                    || project.assets.objects[0].object.indexOf(resourceName) === -1) {
                    throw new GmlError(`Resource ${resourceName} not referenced in ${projectFilePath}`);
                }
                break;
            case "rooms":
                resourceName = resourceName.replace(".room.gmx", "");
                if (!project.assets.rooms[0].room
                    || project.assets.rooms[0].room.indexOf(resourceName) === -1) {
                    throw new GmlError(`Resource ${resourceName} not referenced in ${projectFilePath}`);
                }
                break;
            default:
                throw new GmlError(`Unsupported resource directory, ${resourceParentFolder}`);
        }
    }

    public static addResource(file: OutputFile, project: Project, projectDirectory: string): string {
        const pathName = file.getXmlName();
        let absolutePath = file.rpath;
        if (file instanceof ScriptFile) {
            if (!project.assets.scripts[0].script) {
                project.assets.scripts[0].script = [];
            }
            if (project.assets.scripts[0].script.indexOf(pathName) === -1) {
                project.assets.scripts[0].script.push(pathName);
            }
            absolutePath = path.join(projectDirectory, "scripts", file.rpath);
        } else if (file instanceof ObjectFile) {
            if (!project.assets.objects[0].object) {
                project.assets.objects[0].object = [];
            }
            if (project.assets.objects[0].object.indexOf(pathName) === -1) {
                project.assets.objects[0].object.push(pathName);
            }
            absolutePath = path.join(projectDirectory, "objects", file.rpath);
        } else if (file instanceof RoomFile) {
            if (!project.assets.rooms[0].room) {
                project.assets.rooms[0].room = [];
            }
            if (project.assets.rooms[0].room.indexOf(pathName) === -1) {
                project.assets.rooms[0].room.push(pathName);
            }
            absolutePath = path.join(projectDirectory, "rooms", file.rpath);
        }
        ts.sys.writeFile(absolutePath, file.content);
        return absolutePath;
    }

    public static removeResource(absolutePath: string, project: Project, projectDirectory: string): void {
        const relativePath = absolutePath.replace(projectDirectory, "").replace(/\\/, "");
        const folder = relativePath.split(/\\/)[0];
        let index: number;
        switch (folder) {
            case "objects":
                index = project.assets.objects[0].object.indexOf(relativePath);
                project.assets.objects[0].object.splice(index);
                break;
            case "scripts":
                index = project.assets.scripts[0].script.indexOf(relativePath);
                project.assets.scripts[0].script.splice(index);
                break;
            case "rooms":
                index = project.assets.rooms[0].room.indexOf(relativePath);
                project.assets.rooms[0].room.splice(index);
                break;
            default:
                throw new GmlError(`Unknown directory to remove resource from, ${folder}`);
        }
        fs.unlinkSync(absolutePath);
    }

}
