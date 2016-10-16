var Config = (function(){
    var query_string = {};
    var query = window.location.search.substring(1);
    var vars = query == "" ? [] : query.split("&");
    for (var i = 0; i < vars.length; ++i)
    {
        var pair = vars[i].split("=");
        // If first entry with this name
        if (typeof query_string[pair[0]] === "undefined")
        {
            query_string[pair[0]] = decodeURIComponent(pair[1]);
            // If second entry with this name
        }
        else if (typeof query_string[pair[0]] === "string")
        {
            var arr = [ query_string[pair[0]],decodeURIComponent(pair[1]) ];
            query_string[pair[0]] = arr;
            // If third or later entry with this name
        }
        else
        {
            query_string[pair[0]].push(decodeURIComponent(pair[1]));
        }
    }
    return {
        divisions: query_string["divisions"] || 3,
        mines: query_string["mines"] || 106
    };
})();

var Board = (function(){
    var Board = {};

    // vertices after division are not unique, but no-one cares.
    Board.vertices = [
        [ 1.0, 0.0, 0.0], // 0
        [-1.0, 0.0, 0.0], // 1
        [ 0.0, 1.0, 0.0], // 2
        [ 0.0,-1.0, 0.0], // 3
        [ 0.0, 0.0, 1.0], // 4
        [ 0.0, 0.0,-1.0]  // 5
    ];
    // each triangle is 3 clockwise vertex indices,
    // plus 3 triangle neighbour indices, clockwise starting from the edge clockwise of the first vertex
    Board.triangles = [
        { vi: [ 2, 0, 4 ], ni: [ 3, 4, 1 ] }, // 0
        { vi: [ 2, 4, 1 ], ni: [ 0, 5, 2 ] }, // 1
        { vi: [ 2, 1, 5 ], ni: [ 1, 6, 3 ] }, // 2
        { vi: [ 2, 5, 0 ], ni: [ 2, 7, 0 ] }, // 3
        { vi: [ 3, 4, 0 ], ni: [ 5, 0, 7 ] }, // 4
        { vi: [ 3, 1, 4 ], ni: [ 6, 1, 4 ] }, // 5
        { vi: [ 3, 5, 1 ], ni: [ 7, 2, 5 ] }, // 6
        { vi: [ 3, 0, 5 ], ni: [ 4, 3, 6 ] }, // 7
    ];
    function divide()
    {
        function unitAverage(u, v)
        {
            var ret = [ u[0] + v[0],
                        u[1] + v[1],
                        u[2] + v[2] ];
            var rl = 1 / Math.sqrt(ret[0] * ret[0] + ret[1] * ret[1] + ret[2] * ret[2]);
            ret[0] *= rl;
            ret[1] *= rl;
            ret[2] *= rl;
            return ret;
        }
        var newVertices = [];
        var newTriangles = [];
        for (var i = 0; i < Board.triangles.length; ++i)
        {
            var triangle = Board.triangles[i];
            var v0 = Board.vertices[triangle.vi[0]];
            var v1 = Board.vertices[triangle.vi[1]];
            var v2 = Board.vertices[triangle.vi[2]];
            var v3 = unitAverage(v0, v2);
            var v4 = unitAverage(v0, v1);
            var v5 = unitAverage(v1, v2);
            var vi = newVertices.length;
            var e0 = Board.triangles[triangle.ni[0]].ni.indexOf(i);
            var e1 = Board.triangles[triangle.ni[1]].ni.indexOf(i);
            var e2 = Board.triangles[triangle.ni[2]].ni.indexOf(i);
            newVertices.push(
                v0,  // + 0        v0
                v1,  // + 1  e2   /  \   e0
                v2,  // + 2     v3  - v4
                v3,  // + 3     /  \ /  \
                v4,  // + 4    v2 -v5 - v1
                v5); // + 5        e1
            var ti = newTriangles.length; // i * 4
            var n0 = triangle.ni[0] * 4;
            var n1 = triangle.ni[1] * 4;
            var n2 = triangle.ni[2] * 4;
            newTriangles.push(
                { vi: [ vi + 0, vi + 4, vi + 3 ], ni: [ n0 + ((e0 + 1) % 3), ti + 3, n2 + e2 ] },
                { vi: [ vi + 4, vi + 1, vi + 5 ], ni: [ n0 + e0, n1 + ((e1 + 1) % 3), ti + 3 ] },
                { vi: [ vi + 3, vi + 5, vi + 2 ], ni: [ ti + 3, n1 + e1, n2 + ((e2 + 1) % 3) ] },
                { vi: [ vi + 3, vi + 4, vi + 5 ], ni: [ ti + 0, ti + 1, ti + 2 ] });
        }
        Board.vertices  = newVertices;
        Board.triangles = newTriangles;
    }
    for (var i = 0; i < Config.divisions; ++i)
    {
        divide();
    }

    Board.vertexBuffer = new Float32Array(Board.vertices.length * 3);
    Board.indexBuffer = new Uint16Array(Board.triangles.length * 3);
    for (var i = 0; i < Board.vertices.length; ++i)
    {
        Board.vertexBuffer[i * 3 + 0] = Board.vertices[i][0];
        Board.vertexBuffer[i * 3 + 1] = Board.vertices[i][1];
        Board.vertexBuffer[i * 3 + 2] = Board.vertices[i][2];
    }
    for (var i = 0; i < Board.triangles.length; ++i)
    {
        Board.indexBuffer[i * 3 + 0] = Board.triangles[i].vi[0];
        Board.indexBuffer[i * 3 + 1] = Board.triangles[i].vi[1];
        Board.indexBuffer[i * 3 + 2] = Board.triangles[i].vi[2];
    }

    return Board;
})();

var MouseButtons = {
    LEFT   : 0,
    MIDDLE : 1,
    RIGHT  : 2
};
var Input = (function(){
    var Input = {
        mouseDown: []
    };
    for (var button in MouseButtons)
    {
        Input.mouseDown[MouseButtons[button]] = false;
    }
    return Input;
})();

var PlayState = {
    START  : 0,
    PlAYING: 1,
    WON    : 2,
    LOST   : 3
};
var State = {
    state: PlayState.START,
    minesRemaining: 0,
    startTime: 0,
    timer: 0
};

function mainloop()
{
    var canvas = document.getElementById("canvas");
    var canvas2d = document.getElementById("canvas2d");
    resizeCanvas(canvas);
    resizeCanvas(canvas2d);

    if (State.state == PlayState.START)
    {
        State.timer = 0;
    }
    else if (State.state == PlayState.PLAYING)
    {
        State.timer = Math.floor((Date.now() - State.startTime) / 1000);
    }

    renderMain();
    renderHUD()
    requestAnimationFrame(mainloop);
}

var Render = {
};
Render.init = function ()
{
    var canvas = document.getElementById("canvas");
    var gl = canvas.getContext("webgl");

    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, "\
        uniform mat4 projection; \
        uniform mat4 rotation; \
        \
        attribute vec3 position; \
        varying vec3 outpos; \
        \
        void main() { \
            gl_Position = projection * rotation * vec4(position, 1.0); \
            outpos = (rotation * vec4(position, 1.0)).xyz; \
        } \
    ");
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return alert(gl.getShaderInfoLog(vs));

    gl.getExtension("OES_standard_derivatives");
    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, "#extension GL_OES_standard_derivatives : enable\n\
        precision highp float; \
        varying vec3 outpos; \
        \
        uniform sampler2D envmap; \
        \
        void main() { \
            vec3 dpdx = dFdx(outpos); \
            vec3 dpdy = dFdy(outpos); \
            vec3 normal = normalize(cross(dpdx, dpdy)); \
            gl_FragColor = vec4(normal * 0.5 + 0.5, 1); \
            gl_FragColor = vec4(texture2D(envmap, vec2(normal.x, normal.z))); \
        } \
    ");
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return alert(gl.getShaderInfoLog(fs));

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return alert("oops link");

    var envmap = gl.createTexture();
    envmap.image = new Image();
    envmap.image.onload = function ()
    {
        gl.bindTexture(gl.TEXTURE_2D, envmap);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, envmap.image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    };
    envmap.image.src = "envmap.jpg";

    Render.program = program;
    Render.envmap = envmap;
    Render.vb = gl.createBuffer();
    Render.ib = gl.createBuffer();

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, Render.vb);
    gl.bufferData(gl.ARRAY_BUFFER, Board.vertexBuffer, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, Render.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Board.indexBuffer, gl.STATIC_DRAW);
    var posAttr = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);

    var envsampler = gl.getUniformLocation(program, "envmap");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, envmap);
    gl.uniform1i(envsampler, 0);

    Render.projection = gl.getUniformLocation(program, "projection");
    Render.rotation = gl.getUniformLocation(program, "rotation");
};

function renderMain()
{
    var canvas = document.getElementById("canvas");
    var gl = canvas.getContext("webgl");

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1, 1, 1, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var near = 0.001;
    var far = 2.0;
    var fov = 60 * Math.PI / 180;
    var aspect = canvas.width / canvas.height;
    var f = Math.tan(Math.PI * 0.5 - 0.5 * fov);
    var ri = 1 / (near - far);
    var proj = new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * ri, -1,
        0, 0, 2 * near * far * ri, 0]);
    gl.uniformMatrix4fv(Render.projection, false, proj);

    var rotation = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1]);
    gl.uniformMatrix4fv(Render.rotation, false, rotation);

    gl.drawElements(gl.TRIANGLES, Board.indexBuffer.length, gl.UNSIGNED_SHORT, 0);
}

function renderHUD()
{
    var canvas2d = document.getElementById("canvas2d");
    var ctx = canvas2d.getContext("2d");

    var textBorderOffset = 10;
    var textBorder = 4;
    var textSize = 26;

    ctx.font = textSize + "px mono";
    var textWidth = textSize * 44 / 24; // aprox.
    var textHeight = textSize * 18 / 24; // aprox.
    var textOvershoot = textSize * 2 / 24; // aprox.
    var boxWidth = textBorder * 2 + textWidth;
    var boxHeight = textBorder * 2 + textHeight + textOvershoot * 2;

    function fillText(value)
    {
        var str = value.toString();
        while (str.length < 3)
        {
            str = "0" + str;
        }
        return str.length >= 4 ? "LOL" : str;
    }

    ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(textBorderOffset,
                   textBorderOffset,
                   boxWidth,
                   boxHeight);
    ctx.fillRect(canvas2d.width - boxWidth - textBorderOffset,
                   textBorderOffset,
                   boxWidth,
                   boxHeight);
    ctx.fillStyle = "rgb(255,255,255)";
    ctx.fillText(fillText(State.minesRemaining),
                   textBorderOffset + textBorder,
                   textBorderOffset + textHeight + textBorder + textOvershoot);
    ctx.fillText(fillText(State.timer),
                   canvas2d.width - boxWidth - textBorderOffset + textBorder,
                   textBorderOffset + textHeight + textBorder + textOvershoot);
}

function resizeCanvas(canvas)
{
    var displayWidth  = canvas.clientWidth;
    var displayHeight = canvas.clientHeight;
    if (canvas.width  != displayWidth ||
        canvas.height != displayHeight)
    {
        canvas.width  = displayWidth;
        canvas.height = displayHeight;
    }
}

function startup()
{
    document.addEventListener('contextmenu', function(e)
    {
        e.preventDefault();
    }, false);
    document.addEventListener('mousedown', function (e)
    {
        Input.mouseDown[e.button] = true;
    }, false);
    document.addEventListener('mouseup', function (e)
    {
        Input.mouseDown[e.button] = false;
    }, false);

    Render.init();
    mainloop();
}
window.addEventListener('load', startup);
