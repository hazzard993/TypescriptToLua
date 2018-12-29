import path = require("path");
import ts = require("typescript");
import xml2js = require("xml2js");
import { GmlError } from "./Errors";
import * as gm from "./GMProject";

export class GMHelper {

    /**
     * Returns a new JSON object for a Project
     * @example
     * const json = gmHelper.newProject();
     * setProjectJson("proj.project.gmx", json);
     */
    public static newProject(): gm.Project {
        return gm.newProject();
    }

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
        switch (resourceParentFolder) {
            case "scripts": {
                if (!project.assets.scripts[0].script
                    || project.assets.scripts[0].script.indexOf(relativeResourcePath) === -1) {
                    throw new GmlError(`Resource ${relativeResourcePath} not referenced in ${projectFilePath}`);
                }
                break;
            }
            default: {
                throw new GmlError(`Unsupported resource directory, ${resourceParentFolder}`);
            }
        }
    }

}
