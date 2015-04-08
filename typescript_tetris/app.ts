
var VERTEX_SHADER = `
    precision mediump float;

    attribute vec2 vertexPosition;

    uniform mat3 modelMatrix;
    uniform mat3 projectionMatrix;
    uniform mat3 texMatrix;

    varying vec2 texCoord;

    void main() {
        vec3 position = projectionMatrix * modelMatrix * vec3(vertexPosition, 1.0);
        gl_Position = vec4(position.xy, 0.0, 1.0);
        texCoord = (texMatrix * vec3(vertexPosition.x, 1.0 - vertexPosition.y, 1.0)).xy;
    }
`;

var FRAGMENT_SHADER = `
    precision mediump float;

    varying vec2 texCoord;

    uniform bool loaded;
    uniform sampler2D texture;

    void main() {
        if (loaded) {
            vec4 color = texture2D(texture, texCoord);
            gl_FragColor = color;
        } else {
            gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
        }
    }
`;

var UNIFORM_MODEL_MATRIX: WebGLUniformLocation;
var UNIFORM_PROJECTION_MATRIX: WebGLUniformLocation;
var UNIFORM_LOADED: WebGLUniformLocation;
var UNIFORM_TEXTURE: WebGLUniformLocation;
var UNIFORM_TEX_MATRIX: WebGLUniformLocation;

function initWebGl(canvas: HTMLCanvasElement): WebGLRenderingContext {
    try {
        return (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
    } catch (e) {
        return null;
    }
}

function compileShader(gl: WebGLRenderingContext, shaderType: number, shaderSource: string): WebGLShader {
    var shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log("Error while compiling shader");
        console.log(gl.getShaderInfoLog(shader));
    }
    return shader;
}

function initPipeline(gl: WebGLRenderingContext): void {
    var vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    var fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.log("Error while linking program");
        console.log(gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    UNIFORM_MODEL_MATRIX = gl.getUniformLocation(program, "modelMatrix");
    UNIFORM_PROJECTION_MATRIX = gl.getUniformLocation(program, "projectionMatrix");
    UNIFORM_LOADED = gl.getUniformLocation(program, "loaded");
    UNIFORM_TEXTURE = gl.getUniformLocation(program, "texture");
    UNIFORM_TEX_MATRIX = gl.getUniformLocation(program, "texMatrix");

    var projectionMatrix = new Float32Array([
        // column major
        2.0, 0.0, 0.0,
        0.0, 2.0, 0.0,
        -1.0, -1.0, 1.0,
    ]);
    gl.uniformMatrix3fv(UNIFORM_PROJECTION_MATRIX, false, projectionMatrix);
    gl.uniform1i(UNIFORM_TEXTURE, 0);

    gl.clearColor(0.5, 0.5, 0.5, 1);

    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

window.onload = () => {
    var canvas = <HTMLCanvasElement> document.getElementById("glcanvas");
    var gl = initWebGl(canvas);
    if (!gl) {
        alert("WebGL not supported!");
        return;
    }
    initPipeline(gl);
    var game = new Game(gl);
    window.onkeydown = game.handleKeypress.bind(game);
    setInterval(game.render.bind(game, gl), 1.0 / 60.0);
};

class Vec2 {
    constructor(public x: number = 0, public y: number = 0) {
    }
}

class Vec3 {
    constructor(public x: number = 0, public y: number = 0, public z: number = 0) {
    }
}

class Array2D<T> {
    private data: T[];
    private width_: number;
    private height_: number;
    
    constructor(width: number, height: number, init: T = null) {
        this.data = new Array<T>(width * height);
        for (var i = 0; i < this.data.length; ++i) {
            this.data[i] = init;
        }
        this.width_ = width;
        this.height_ = height;
    }

    get size(): Vec2 {
        return new Vec2(this.width, this.height);
    }

    get width(): number {
        return this.width_;
    }

    get height(): number {
        return this.height_;
    }

    get(x: number, y: number): T {
        if (x < 0 || x >= this.width) throw "Index out of bounds (" + x + "/" + y + ")";
        if (y < 0 || y >= this.height) throw "Index out of bounds (" + x + "/" + y + ")";
        return this.data[y * this.width + x];
    }

    set(x: number, y: number, value: T) {
        if (x < 0 || x >= this.width) throw "Index out of bounds (" + x + "/" + y + ")";
        if (y < 0 || y >= this.height) throw "Index out of bounds (" + x + "/" + y + ")";
        this.data[y * this.width + x] = value;
    }
}

class SpriteImage {
    private texture: WebGLTexture;

    private loaded: boolean;
    private image: HTMLImageElement;

    constructor(path: string) {
        this.texture = null;
        this.loaded = false;

        this.image = new Image();
        this.image.onload = () => {
            this.loaded = true;
        }
        this.image.src = path + ".png";
    }

    private upload(gl: WebGLRenderingContext): void {
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.image = null;
    }

    bind(gl: WebGLRenderingContext): void {
        if (this.loaded) {
            if (!this.texture) {
                this.upload(gl);
            }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.uniform1i(UNIFORM_LOADED, 1);
        } else {
            gl.uniform1i(UNIFORM_LOADED, 0);
        }
    }
}

class Sprite {
    static DUMMY_IMAGE = new SpriteImage("dummy");

    position: Vec3;  // absolute position [0; 1]
    size: Vec2;  // absolute size [0; 1]
    visible: boolean;  // is visible?
    image: SpriteImage;  // image to display
    textureSize: Vec2;  // absolute size of one texture tile (null allowed)
    textureOffset: Vec2;  // offset (in texture coordinates)

    constructor() {
        this.position = new Vec3();
        this.size = new Vec2(1, 1);
        this.visible = true;
        this.image = Sprite.DUMMY_IMAGE;
        this.textureSize = null;
        this.textureOffset = new Vec2(0, 0);
    }
}

class SpriteRenderer {
    private buffer: WebGLBuffer;

    constructor(gl: WebGLRenderingContext) {
        var data = new Float32Array([
          //  x,   y,
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
        ]);

        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }

    render(gl: WebGLRenderingContext, sprite: Sprite): void {
        if (!sprite.visible)
            return;

        var modelMatrix = new Float32Array([
            // column major!
            sprite.size.x,     0.0,               0.0,
            0.0,               sprite.size.y,     0.0,
            sprite.position.x, sprite.position.y, 1.0,
        ]);
        gl.uniformMatrix3fv(UNIFORM_MODEL_MATRIX, false, modelMatrix);

        var texX: number, texY: number;
        if (sprite.textureSize) {
            texX = sprite.textureSize.x;
            texY = sprite.textureSize.y;
        } else {
            texX = sprite.size.x;
            texY = sprite.size.y;
        }
        var texMatrix = new Float32Array([
            // column major!
            sprite.size.x / texX, 0.0, 0.0,
            0.0, sprite.size.y / texY, 0.0,
            sprite.textureOffset.x, sprite.textureOffset.y, 1.0,
        ]);
        gl.uniformMatrix3fv(UNIFORM_TEX_MATRIX, false, texMatrix);

        sprite.image.bind(gl);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(0);
    }
}

class GameText {
    constructor(
        public text: string,
        public position: Vec3,
        public visible: boolean = true) {
    }
}

class TextRenderer {

    private spriteRenderer: SpriteRenderer;
    private sprite: Sprite;
    private charSizeTexture: Vec2;

    constructor(gl: WebGLRenderingContext, font: string, charSizeScreen: Vec2, charSizeTexture: Vec2) {
        this.spriteRenderer = new SpriteRenderer(gl);
        this.charSizeTexture = charSizeTexture;

        this.sprite = new Sprite();
        this.sprite.size = charSizeScreen;
        this.sprite.image = new SpriteImage(font);
        this.sprite.textureSize = new Vec2(
            this.sprite.size.x / charSizeTexture.x,
            this.sprite.size.y / charSizeTexture.y);
    }

    render(gl: WebGLRenderingContext, text: GameText): void {
        if (!text.visible)
            return;

        this.sprite.position = new Vec3(text.position.x, text.position.y, text.position.z);
        for (var i = 0; i < text.text.length; ++i) {
            var c = text.text.charCodeAt(i);

            this.sprite.textureOffset = new Vec2(
                this.charSizeTexture.x * (c % Math.round(1 / this.charSizeTexture.x)),
                this.charSizeTexture.y * Math.floor(c / Math.round(1 / this.charSizeTexture.x)));
            this.spriteRenderer.render(gl, this.sprite);

            this.sprite.position.x += this.sprite.size.x;
        }
    }

}

class Game {
    static UNIT = 1 / 22;
    static WIDTH = 12;
    static HEIGHT = 21;

    static CELLS = [
        new SpriteImage("block1"),
        new SpriteImage("block2"),
        new SpriteImage("block3"),
        new SpriteImage("block4"),
        new SpriteImage("block5"),
        new SpriteImage("block6"),
        new SpriteImage("block7"),
    ];
    static BG = new SpriteImage("gamebg");
    static MASTER_BG = new SpriteImage("bg");

    static PIECE_SIZE = 4;
    static PIECES = [
        [
            [
                [0, 1, 1, 0],
                [0, 1, 1, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(),
        ], [
            [
                [0, 0, 1, 0],
                [0, 1, 1, 0],
                [0, 1, 0, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 1, 1, 0],
                [0, 0, 1, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(),
        ], [
            [
                [0, 1, 0, 0],
                [0, 1, 1, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 0, 1, 1],
                [0, 1, 1, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(),
        ], [
            [
                [0, 1, 0, 0],
                [0, 1, 1, 0],
                [0, 1, 0, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 1, 1, 1],
                [0, 0, 1, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 0, 1, 0],
                [0, 1, 1, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 0, 1, 0],
                [0, 1, 1, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(),
        ], [
            [
                [0, 0, 1, 0],
                [0, 0, 1, 0],
                [0, 0, 1, 0],
                [0, 0, 1, 0],
            ].reverse(), [
                [1, 1, 1, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(),
        ], [
            [
                [0, 1, 0, 0],
                [0, 1, 0, 0],
                [0, 1, 1, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 1, 1, 1],
                [0, 1, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 1, 1, 0],
                [0, 0, 1, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 0, 0, 1],
                [0, 1, 1, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(),
        ], [
            [
                [0, 0, 1, 0],
                [0, 0, 1, 0],
                [0, 1, 1, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 1, 0, 0],
                [0, 1, 1, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 1, 1, 0],
                [0, 1, 0, 0],
                [0, 1, 0, 0],
                [0, 0, 0, 0],
            ].reverse(), [
                [0, 1, 1, 1],
                [0, 0, 0, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ].reverse(),
        ],
    ];

    private spriteRenderer: SpriteRenderer;
    private textRenderer: TextRenderer;

    private spriteBg: Sprite;
    private spriteField: Sprite;
    private spritesCell: Sprite[];
    private spriteNextPiece: Sprite;

    private textScore: GameText;
    private textScoreNumbers: GameText;
    private textLevel: GameText;
    private textLevelNumbers: GameText;
    private textScoreNext: GameText;
    private textScoreNextNumbers: GameText;
    private textGame: GameText;
    private textOver: GameText;

    private currentPieceIdx: number;
    private currentPos: Vec2;
    private currentRotIdx: number;
    private nextPieceIdx: number;

    private field: Array2D<number>;
    private gameOver: boolean;
    private moveTimeout: number;
    private score: number;
    private level: number;

    private get currentPiece(): number[][]{
        if (this.currentPieceIdx == null) {
            return null;
        } else {
            return Game.PIECES[this.currentPieceIdx][this.currentRotIdx];
        }
    }

    constructor(gl: WebGLRenderingContext) {
        this.spriteRenderer = new SpriteRenderer(gl);
        this.textRenderer = new TextRenderer(gl, "font1", new Vec2(Game.UNIT, Game.UNIT), new Vec2(1 / 16, 1/ 16));

        this.spriteBg = new Sprite();
        this.spriteBg.size = new Vec2(1, 1);
        this.spriteBg.image = Game.MASTER_BG;
        this.spriteBg.textureSize = new Vec2(1024 / 704, 512/706);

        this.spriteField = new Sprite();
        this.spriteField.position = new Vec3(Game.UNIT, Game.UNIT, -1);
        this.spriteField.size = new Vec2(12 * Game.UNIT, 1 - Game.UNIT);
        this.spriteField.image = Game.BG;
        this.spriteField.textureSize = new Vec2(Game.UNIT * 2, Game.UNIT * 2);

        this.spritesCell = [];
        Game.CELLS.forEach((c) => {
            var sprite = new Sprite();
            sprite.image = c;
            sprite.size = new Vec2(Game.UNIT, Game.UNIT);
            this.spritesCell.push(sprite);
        });

        this.spriteNextPiece = new Sprite();
        this.spriteNextPiece.position = new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 7);
        this.spriteNextPiece.size = new Vec2(Game.UNIT * 4, Game.UNIT * 6);
        this.spriteNextPiece.image = this.spriteField.image;
        this.spriteNextPiece.textureSize = this.spriteField.textureSize;

        this.textScore = new GameText("SCORE", new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 9));
        this.textScoreNumbers = new GameText("------", new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 10));
        this.textLevel = new GameText("LEVEL", new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 12));
        this.textLevelNumbers = new GameText("---", new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 13));
        this.textScoreNext = new GameText("NEXT", new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 15));
        this.textScoreNextNumbers = new GameText("------", new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 16));
        this.textGame = new GameText("\23 GAME", new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 18));
        this.textOver = new GameText("\23 OVER", new Vec3(Game.UNIT * 14, 1 - Game.UNIT * 19));

        this.field = new Array2D(Game.WIDTH, Game.HEIGHT, 0);
        this.currentPieceIdx = null;
        this.currentPos = new Vec2();
        this.gameOver = false;
        this.level = 1;
        this.score = 0;

        this.nextPieceIdx = Math.floor(Math.random() * Game.PIECES.length);
        this.move();
        this.updateTexts();
    }

    private collisionTest(piece: number[][], pos: Vec2): boolean {
        for (var x = 0; x < Game.PIECE_SIZE; ++x) {
            for (var y = 0; y < Game.PIECE_SIZE; ++y) {
                if (piece[y][x] == 1) {
                    var theX = pos.x + x;
                    var theY = pos.y + y;
                    if (theX < 0 || theX >= Game.WIDTH ||
                        theY < 0 || theY >= Game.HEIGHT ||
                        this.field.get(theX, theY) != 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private rotatePiece(): void {
        // Clockwise rotation.
        var nextRotIdx = (this.currentRotIdx + 1) % Game.PIECES[this.currentPieceIdx].length;
        if (!this.collisionTest(Game.PIECES[this.currentPieceIdx][nextRotIdx], this.currentPos)) {
            this.currentRotIdx = nextRotIdx;
        }
    }

    private updateScore(): void {
        var fullRows: number[] = [];
        for (var y = 0; y < Game.HEIGHT; ++y) {
            var currentRowFull = true;
            for (var x = 0; x < Game.WIDTH; ++x) {
                if (this.field.get(x, y) == 0) {
                    currentRowFull = false;
                    break;
                }
            }
            if (currentRowFull) {
                fullRows.push(y);
            }
        }

        if (fullRows.length == 0) {
            return;
        }

        // Note that deleting rows is sorted ascending!
        var i = 0;
        fullRows.forEach((deletingRow) => {
            for (var y = deletingRow - i; y < Game.HEIGHT; ++y) {
                for (var x = 0; x < Game.WIDTH; ++x) {
                    if (y + 1 >= Game.HEIGHT) {
                        this.field.set(x, y, 0);
                    } else {
                        this.field.set(x, y, this.field.get(x, y + 1));
                    }
                }
            }

            ++i;
        });

        // TODO SCORE! LEVEL!
        var base: number;
        switch (fullRows.length) {
            case 1:
                base = 40;
                break;
            case 2:
                base = 100;
                break;
            case 3:
                base = 300;
                break;
            case 4:
            default:
                base = 1200;
                break;
        }
        this.score += base * this.level;
        
        while (this.score >= Game.levelMinScore(this.level + 1))
            ++this.level;
        
        this.updateTexts();
    }

    private static levelMinScore(level: number): number {
        // Have a jump every this.level * 1200 points,
        // that means, the points for each level l are
        //     SUM (1200 * n) for n in 1..(l-1)
        // and this happens to be
        //     600 * l * (l - 1)
        // Thanks Wolfram!
        return 600 * level * (level - 1);
    }

    private updateTexts(): void {
        this.textScoreNumbers.text = "" + this.score;
        while (this.textScoreNumbers.text.length < 6) {
            this.textScoreNumbers.text = "0" + this.textScoreNumbers.text;
        }

        this.textLevelNumbers.text = "" + this.level;
        while (this.textLevelNumbers.text.length < 3) {
            this.textLevelNumbers.text = "0" + this.textLevelNumbers.text;
        }

        this.textScoreNextNumbers.text = "" + Game.levelMinScore(this.level + 1);
        while (this.textScoreNextNumbers.text.length < 6) {
            this.textScoreNextNumbers.text = "0" + this.textScoreNextNumbers.text;
        }
    }

    private move(dropping: boolean = false): void {
        if (this.moveTimeout) {
            clearTimeout(this.moveTimeout);
        }

        do {
            if (this.currentPieceIdx == null) {

                dropping = false;  // Stop dropping if we are dropping

                // Spawn a piece.
                this.currentPieceIdx = this.nextPieceIdx;
                this.currentPos.x = Math.floor((Game.WIDTH - Game.PIECE_SIZE) / 2);
                this.currentPos.y = Game.HEIGHT - Game.PIECE_SIZE;
                this.currentRotIdx = 0;

                this.nextPieceIdx = Math.floor(Math.random() * Game.PIECES.length);
                
                // Game Over?
                if (this.collisionTest(this.currentPiece, this.currentPos)) {
                    this.gameOver = true;
                }

            } else {

                var nextPos = new Vec2(this.currentPos.x, this.currentPos.y - 1);
                if (this.collisionTest(this.currentPiece, nextPos)) {
                    // In case of a collision stop and realize the piece.
                    for (var x = 0; x < Game.PIECE_SIZE; ++x) {
                        for (var y = 0; y < Game.PIECE_SIZE; ++y) {
                            if (this.currentPiece[y][x] == 1) {
                                this.field.set(this.currentPos.x + x, this.currentPos.y + y, this.currentPieceIdx + 1);
                            }
                        }
                    }
                    this.currentPieceIdx = null;

                    this.updateScore();
                } else {
                    // Otherwise move it down.
                    this.currentPos = nextPos;
                }

            }
        } while (dropping);

        if (!this.gameOver) {
            this.moveTimeout = setTimeout(this.move.bind(this), 1000 * Math.pow(3 / 4, this.level - 1));
        }
    }

    render(gl: WebGLRenderingContext): void {
        this.spriteRenderer.render(gl, this.spriteBg);
        this.spriteRenderer.render(gl, this.spriteField);

        for (var x = 0; x < this.field.width; ++x) {
            for (var y = 0; y < this.field.height; ++y) {
                var value = this.field.get(x, y);
                if (value != 0) {
                    var idx = value - 1;
                    this.spritesCell[idx].position.x = (1 + x) * Game.UNIT;
                    this.spritesCell[idx].position.y = (1 + y) * Game.UNIT;
                    this.spriteRenderer.render(gl, this.spritesCell[idx]);
                }
            }
        }

        if (this.currentPiece) {
            for (var x = 0; x < Game.PIECE_SIZE; ++x) {
                for (var y = 0; y < Game.PIECE_SIZE; ++y) {
                    if (this.currentPiece[y][x] == 1) {
                        var idx = this.currentPieceIdx;
                        this.spritesCell[idx].position.x = (1 + x + this.currentPos.x) * Game.UNIT;
                        this.spritesCell[idx].position.y = (1 + y + this.currentPos.y) * Game.UNIT;
                        this.spriteRenderer.render(gl, this.spritesCell[idx]);
                    }
                }
            }
        }

        this.spriteRenderer.render(gl, this.spriteNextPiece);
        var nextPiece = Game.PIECES[this.nextPieceIdx][0];
        for (var x = 0; x < Game.PIECE_SIZE; ++x) {
            for (var y = 0; y < Game.PIECE_SIZE; ++y) {
                if (nextPiece[y][x] == 1) {
                    var idx = this.nextPieceIdx;
                    this.spritesCell[idx].position.x = (14 + x) * Game.UNIT;
                    this.spritesCell[idx].position.y = (16 + y) * Game.UNIT;
                    this.spriteRenderer.render(gl, this.spritesCell[idx]);
                }
            }
        }

        this.textRenderer.render(gl, this.textScore);
        this.textRenderer.render(gl, this.textScoreNumbers);
        this.textRenderer.render(gl, this.textLevel);
        this.textRenderer.render(gl, this.textLevelNumbers);
        this.textRenderer.render(gl, this.textScoreNext);
        this.textRenderer.render(gl, this.textScoreNextNumbers);

        if (this.gameOver) {
            this.textRenderer.render(gl, this.textGame);
            this.textRenderer.render(gl, this.textOver);
        }
    }

    handleKeypress(ev: KeyboardEvent): void {
        switch (ev.keyCode) {
            case 0x28:
                if (!this.gameOver && this.currentPiece) {
                    this.move(true);
                }
                break;
            case 0x26:
                if (!this.gameOver && this.currentPiece) {
                    this.rotatePiece();
                }
                break;
            case 0x25:
                if (!this.gameOver && this.currentPiece) {
                    var nextPos = new Vec2(this.currentPos.x - 1, this.currentPos.y);
                    if (!this.collisionTest(this.currentPiece, nextPos)) {
                        this.currentPos = nextPos;
                    }
                }
                break;
            case 0x27:
                if (!this.gameOver && this.currentPiece) {
                    var nextPos = new Vec2(this.currentPos.x + 1, this.currentPos.y);
                    if (!this.collisionTest(this.currentPiece, nextPos)) {
                        this.currentPos = nextPos;
                    }
                }
                break;
            default:
                // Do not prevent the default.
                return;
        }

        ev.preventDefault();
    }
}
