/**
 * The literal name of the sprite resource
 */
type Sprite = number;

type Flag = -1 | 0;

interface ScriptsFolder {
    $: {
        name: string,
    };
    scripts?: ScriptsFolder[];
    script?: string[];
}

interface Shader {
    $: {
        type: string;
    };
    _: string;
}

interface ShadersFolder {
    $: {
        type: string,
        name: string,
    };
    _?: string[],
    shaders?: ShadersFolder[];
    shader?: Shader[];
}

interface FontsFolder {
    $: {
        name: string,
    };
    fonts?: FontsFolder[];
    font?: string[];
}

interface TimelinesFolder {
    $: {
        name: string,
    };
    timelines?: TimelinesFolder[];
    timeline?: string[];
}

interface SoundsFolder {
    $: {
        name: string,
    };
    sounds?: SoundsFolder[];
    sound?: string[];
}

interface SpritesFolder {
    $: {
        name: string,
    };
    sprites?: SpritesFolder[];
    sprite?: string[];
}

interface BackgroundsFolder {
    $: {
        name: string,
    };
    backgrounds?: BackgroundsFolder[];
    background?: string[];
}

interface PathsFolder {
    $: {
        name: string,
    };
    paths?: PathsFolder[];
    path?: string[];
}

interface ObjectsFolder {
    $: {
        name: string,
    };
    objects?: ObjectsFolder[];
    object?: string[];
}

interface RoomsFolder {
    $: {
        name: string,
    };
    rooms?: RoomsFolder[];
    room?: string[];
}

/**
 * JSON structure for a .project.gmx file.
 * Can be converted to acceptable project XML via xml2js for Game Maker.
 */
export interface Project {
    assets: {
        Configs: [
            {
                $: {
                    name: "configs",
                },
                Config: string[],
            }
        ],
        NewExtensions: [
            {
                NewExtension: string[],
            }
        ],
        sounds: SoundsFolder[],
        sprites: SpritesFolder[],
        backgrounds: BackgroundsFolder[],
        paths: PathsFolder[],
        scripts: ScriptsFolder[],
        shaders: ShadersFolder[],
        fonts: FontsFolder[],
        timelines: TimelinesFolder[],
        objects: ObjectsFolder[],
        rooms: RoomsFolder[],
        help: [
            {
                rtf: "help.rtf",
            }
        ],
        TutorialState: [
            {
                IsTutorial: 0,
                TutorialName: "",
                TutorialPage: 0,
            }
        ],
    };
}

interface Event {
    $: {
        eventtype: number,
        enumb: number,
    };
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
        whoName: "self" | "other" | object,
        relative: 0,
        isnot: 0,
        arguments: {
            argument: [
                {
                    kind: 1,
                    /**
                     * The script action's contents
                     */
                    string: string,
                }
            ],
        },
    };
}

interface GMXObject {
    object: {
        spriteName: "<undefined>" | Sprite,
        solid: Flag,
        visible: Flag,
        depth: number,
        persistent: Flag,
        parentName: "<undefined>" | object,
        maskName: "<undefined>" | Sprite,
        events: {
            event: Event[],
        },
        PhysicsObject: number,
        PhysicsObjectSensor: number,
        PhysicsObjectShape: number,
        PhysicsObjectDensity: number,
        PhysicsObjectRestitution: number,
        PhysicsObjectGroup: number,
        PhysicsObjectLinearDamping: number,
        PhysicsObjectAngularDamping: number,
        PhysicsObjectFriction: number,
        PhysicsObjectAwake: Flag,
        PhysicsObjectKinematic: Flag,
        PhysicsShapePoints: {
            point: string[],
        },
    };
}

export interface Background {
    visible: Flag,
    foreground: Flag,
    name: string,
    x: number,
    y: number,
    htiled: Flag,
    vtiles: Flag,
    hspeed: number,
    vspeed: number,
    stretch: Flag,
}

export interface View {
    visible: Flag,
    objName: "<undefined>" | object,
    xview: number,
    yview: number,
    wview: Number,
    hview: number,
    xport: number,
    yport: number,
    wport: number,
    hport: number,
    hborder: number,
    vborder: number,
    hspeed: number,
    vspeed: number,
}

export interface Room {
    room: {
        caption: string,
        width: number,
        height: number,
        vsnap: number,
        hsnap: number,
        isometric: number,
        speed: number,
        persistent: 0,
        color: number,
        showcolour: -1,
        code: string,
        enableViews: Flag,
        clearViewBackground: Flag,
        clearDisplayBuffer: Flag,
        makeSettings: {
            isSet: Flag,
            w: number,
            h: number,
            showGrid: Flag,
            showObjects: Flag,
            showTiles: Flag,
            showBackgrounds: Flag,
            showForegrounds: Flag,
            showViews: Flag,
            deleteUnderlyingObj: Flag,
            deleteUnderlyingTiles: Flag,
            page: number,
            xoffset: number,
            yoffset: number,
        },
        backgrounds: {
            background: Background[],
        },
        views: {
            view: View[],
        }
    };
}