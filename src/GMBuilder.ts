import { Event, GMXObject, Project, Room } from "./GMResources";

// tslint:disable:object-literal-sort-keys
export class GMBuilder {

    public static newProject(): Project {
        return {
            assets: {
                Configs: [
                    {
                        $: {
                            name: "configs",
                        },
                        Config: ["Configs\\Default"],
                    },
                ],
                NewExtensions: [
                    {
                        NewExtension: [],
                    },
                ],
                sounds: [
                    {
                        $: {
                            name: "sound",
                        },
                    },
                ],
                sprites: [
                    {
                        $: {
                            name: "sprites",
                        },
                    },
                ],
                backgrounds: [
                    {
                        $: {
                            name: "backgrounds",
                        },
                    },
                ],
                paths: [
                    {
                        $: {
                            name: "paths",
                        },
                    },
                ],
                scripts: [
                    {
                        $: {
                            name: "scripts",
                        },
                    },
                ],
                objects: [
                    {
                        $: {
                            name: "objects",
                        },
                    },
                ],
                rooms: [
                    {
                        $: {
                            name: "rooms",
                        },
                    },
                ],
                help: [
                    {
                        rtf: "help.rtf",
                    },
                ],
                TutorialState: [
                    {
                        IsTutorial: 0,
                        TutorialName: "",
                        TutorialPage: 0,
                    },
                ],
            },
        } as Project;
    }

    public static newEvent(eventType: number, eventNumber: number, script: string): Event {
        return {
            $: {
                eventtype: eventType,
                enumb: eventNumber,
            },
            action: {
                libid: 1,
                id: 603,
                kind: 7,
                userelative: 0,
                isquestion: 0,
                useapplyto: -1,
                exetype: 2,
                functionname: "",
                codestring: "",
                whoName: "self",
                relative: 0,
                isnot: 0,
                arguments: {
                    argument: [
                        {
                            kind: 1,
                            string: script,
                        },
                    ],
                },
            },
        };
    }

    public static newObject(): GMXObject {
        return {
            object: {
                spriteName: "<undefined>",
                solid: 0,
                visible: -1,
                depth: 0,
                persistent: 0,
                parentName: "<undefined>",
                maskName: "<undefined>",
                events: {
                    event: [],
                },
                PhysicsObject: 0,
                PhysicsObjectSensor: 0,
                PhysicsObjectShape: 2,
                PhysicsObjectDensity: 0.5,
                PhysicsObjectRestitution: 0.100000001490116,
                PhysicsObjectGroup: 0,
                PhysicsObjectLinearDamping: 0.100000001490116,
                PhysicsObjectAngularDamping: 0.100000001490116,
                PhysicsObjectFriction: 0.200000002980232,
                PhysicsObjectAwake: -1,
                PhysicsObjectKinematic: 0,
                PhysicsShapePoints: {
                    point: [],
                },
            },
        };
    }

    public static newRoom(): Room {
        return {
            room: {
                caption: "",
                width: 1024,
                height: 768,
                vsnap: 32,
                hsnap: 32,
                isometric: 0,
                speed: 30,
                persistent: 0,
                color: 12632256,
                showcolour: -1,
                code: "",
                enableViews: 0,
                clearViewBackground: -1,
                clearDisplayBuffer: -1,
                makeSettings: {
                    isSet: 0,
                    w: 0,
                    h: 0,
                    showGrid: 0,
                    showObjects: 0,
                    showTiles: 0,
                    showBackgrounds: 0,
                    showForegrounds: 0,
                    showViews: 0,
                    deleteUnderlyingObj: 0,
                    deleteUnderlyingTiles: 0,
                    page: 0,
                    xoffset: 0,
                    yoffset: 0,
                },
                backgrounds: {
                    background: [
                        {
                            visible: 0,
                            foreground: 0,
                            name: "",
                            x: 0,
                            y: 0,
                            htiled: -1,
                            vtiles: -1,
                            hspeed: 0,
                            vspeed: 0,
                            stretch: 0,
                        },
                        {
                            visible: 0,
                            foreground: 0,
                            name: "",
                            x: 0,
                            y: 0,
                            htiled: -1,
                            vtiles: -1,
                            hspeed: 0,
                            vspeed: 0,
                            stretch: 0,
                        },
                        {
                            visible: 0,
                            foreground: 0,
                            name: "",
                            x: 0,
                            y: 0,
                            htiled: -1,
                            vtiles: -1,
                            hspeed: 0,
                            vspeed: 0,
                            stretch: 0,
                        },
                        {
                            visible: 0,
                            foreground: 0,
                            name: "",
                            x: 0,
                            y: 0,
                            htiled: -1,
                            vtiles: -1,
                            hspeed: 0,
                            vspeed: 0,
                            stretch: 0,
                        },
                        {
                            visible: 0,
                            foreground: 0,
                            name: "",
                            x: 0,
                            y: 0,
                            htiled: -1,
                            vtiles: -1,
                            hspeed: 0,
                            vspeed: 0,
                            stretch: 0,
                        },
                        {
                            visible: 0,
                            foreground: 0,
                            name: "",
                            x: 0,
                            y: 0,
                            htiled: -1,
                            vtiles: -1,
                            hspeed: 0,
                            vspeed: 0,
                            stretch: 0,
                        },
                        {
                            visible: 0,
                            foreground: 0,
                            name: "",
                            x: 0,
                            y: 0,
                            htiled: -1,
                            vtiles: -1,
                            hspeed: 0,
                            vspeed: 0,
                            stretch: 0,
                        },
                        {
                            visible: 0,
                            foreground: 0,
                            name: "",
                            x: 0,
                            y: 0,
                            htiled: -1,
                            vtiles: -1,
                            hspeed: 0,
                            vspeed: 0,
                            stretch: 0,
                        },
                    ],
                },
                views: {
                    view: [
                        {
                            visible: 0,
                            objName: "<undefined>",
                            xview: 0,
                            yview: 0,
                            wview: 1024,
                            hview: 768,
                            xport: 0,
                            yport: 0,
                            wport: 1024,
                            hport: 768,
                            hborder: 32,
                            vborder: 32,
                            hspeed: -1,
                            vspeed: -1,
                        },
                        {
                            visible: 0,
                            objName: "<undefined>",
                            xview: 0,
                            yview: 0,
                            wview: 1024,
                            hview: 768,
                            xport: 0,
                            yport: 0,
                            wport: 1024,
                            hport: 768,
                            hborder: 32,
                            vborder: 32,
                            hspeed: -1,
                            vspeed: -1,
                        },
                        {
                            visible: 0,
                            objName: "<undefined>",
                            xview: 0,
                            yview: 0,
                            wview: 1024,
                            hview: 768,
                            xport: 0,
                            yport: 0,
                            wport: 1024,
                            hport: 768,
                            hborder: 32,
                            vborder: 32,
                            hspeed: -1,
                            vspeed: -1,
                        },
                        {
                            visible: 0,
                            objName: "<undefined>",
                            xview: 0,
                            yview: 0,
                            wview: 1024,
                            hview: 768,
                            xport: 0,
                            yport: 0,
                            wport: 1024,
                            hport: 768,
                            hborder: 32,
                            vborder: 32,
                            hspeed: -1,
                            vspeed: -1,
                        },
                        {
                            visible: 0,
                            objName: "<undefined>",
                            xview: 0,
                            yview: 0,
                            wview: 1024,
                            hview: 768,
                            xport: 0,
                            yport: 0,
                            wport: 1024,
                            hport: 768,
                            hborder: 32,
                            vborder: 32,
                            hspeed: -1,
                            vspeed: -1,
                        },
                        {
                            visible: 0,
                            objName: "<undefined>",
                            xview: 0,
                            yview: 0,
                            wview: 1024,
                            hview: 768,
                            xport: 0,
                            yport: 0,
                            wport: 1024,
                            hport: 768,
                            hborder: 32,
                            vborder: 32,
                            hspeed: -1,
                            vspeed: -1,
                        },
                        {
                            visible: 0,
                            objName: "<undefined>",
                            xview: 0,
                            yview: 0,
                            wview: 1024,
                            hview: 768,
                            xport: 0,
                            yport: 0,
                            wport: 1024,
                            hport: 768,
                            hborder: 32,
                            vborder: 32,
                            hspeed: -1,
                            vspeed: -1,
                        },
                        {
                            visible: 0,
                            objName: "<undefined>",
                            xview: 0,
                            yview: 0,
                            wview: 1024,
                            hview: 768,
                            xport: 0,
                            yport: 0,
                            wport: 1024,
                            hport: 768,
                            hborder: 32,
                            vborder: 32,
                            hspeed: -1,
                            vspeed: -1,
                        },
                    ],
                },
            },
        };
    }

}
