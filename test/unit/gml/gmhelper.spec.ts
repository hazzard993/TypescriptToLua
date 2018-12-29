import { Expect, FocusTest, Test, TestCase } from "alsatian";
import mock = require("mock-fs");
import { GMHelper as gmHelper } from "../../../src/GMHelper";

const projectXML = `
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assets>
  <Configs name="configs">
    <Config>Configs\\Default</Config>
  </Configs>
  <NewExtensions/>
  <sounds name="sound"/>
  <sprites name="sprites"/>
  <backgrounds name="backgrounds"/>
  <paths name="paths"/>
  <scripts name="scripts"/>
  <objects name="objects"/>
  <rooms name="rooms"/>
  <help>
    <rtf>help.rtf</rtf>
  </help>
  <TutorialState>
    <IsTutorial>0</IsTutorial>
    <TutorialName/>
    <TutorialPage>0</TutorialPage>
  </TutorialState>
</assets>
`;

export class GMHelperTests {

    @TestCase(true, true, true)
    @TestCase(false, true, false)
    @TestCase(true, false, false)
    @TestCase(false, false, false)
    @Test("Test that a valid resource must be referenced and placed in a specific location")
    public testValidation(appendToProject: boolean,
                          matchPaths: boolean,
                          throwsError: boolean): void {
        const path = "scripts\\test.gml";
        const project = gmHelper.newProject();
        if (appendToProject) {
            project.assets.scripts[0].script = [path];
        }
        mock({
            [matchPaths ? path : "scripts\\invalid.gml"]: mock.file({
                content: "// test",
            }),
        });
        const projectFileName = "Test.project.gmx";
        gmHelper.setProjectJson(projectFileName, project);
        if (throwsError) {
            Expect(() => gmHelper.validateResource(path, projectFileName)).not.toThrow();
        } else {
            Expect(() => gmHelper.validateResource(path, projectFileName)).toThrow();
        }
        mock.restore();
    }

    @Test("Get a project's information via JSON")
    public testGetProjectJson(): void {
        mock({
            "Test.project.gmx": mock.file({
                content: projectXML,
            }),
        });
        const project = gmHelper.getProjectJson("Test.project.gmx");
        Expect(project.assets).not.toBeNull();
        mock.restore();
    }

}