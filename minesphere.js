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
        mines: query_string["mines"] || 106,
        fov: query_string["fov"] || 100,
        layback: query_string["layback"] || 1,
        normalize: !query_string["dont_normalize"],
        tiles: query_string["tiles"] || "tiles_en.png"
    };
})();

var Board = (function(){
    var Board = {};

    var X = 1.0;
    var Z = (1.0 + Math.sqrt(5.0)) / 2.0;
    var il = 1 / Math.sqrt(X * X + Z * Z);
    X *= il;
    Z *= il;
    var vertices = [
        [ -X,  0,  Z ], // 0
        [  X,  0,  Z ], // 1
        [ -X,  0, -Z ], // 2
        [  X,  0, -Z ], // 3
        [  0,  Z,  X ], // 4
        [  0,  Z, -X ], // 5
        [  0, -Z,  X ], // 6
        [  0, -Z, -X ], // 7
        [  Z,  X,  0 ], // 8
        [ -Z,  X,  0 ], // 9
        [  Z, -X,  0 ], // 10
        [ -Z, -X,  0 ]  // 11
    ];
    var tris = [
        [  0,  1,  4 ],
        [  0,  4,  9 ],
        [  9,  4,  5 ],
        [  4,  8,  5 ],
        [  4,  1,  8 ],
        [  8,  1, 10 ],
        [  8, 10,  3 ],
        [  5,  8,  3 ],
        [  5,  3,  2 ],
        [  2,  3,  7 ],
        [  7,  3, 10 ],
        [  7, 10,  6 ],
        [  7,  6, 11 ],
        [ 11,  6,  0 ],
        [  0,  6,  1 ],
        [  6, 10,  1 ],
        [  9, 11,  0 ],
        [  9,  2, 11 ],
        [  9,  5,  2 ],
        [  7, 11,  2 ]
    ];
    function getEdge(v0, v1)
    {
        // look for triangle edge v0, v1 counterclockwise
        for (var i = 0; i < tris.length; ++i)
        {
            var t = tris[i];
            if ((t[0] == v1 && t[1] == v0) ||
                (t[1] == v1 && t[2] == v0) ||
                (t[2] == v1 && t[0] == v0))
            {
                return i;
            }
        }
    }
    // plus 3 triangle neighbour indices, clockwise starting from the edge clockwise of the first vertex
    // this allows us to keep track of triangle adjacencies throughout the subdivision process
    // as well as having an easy way to iterate around vertices
    Board.triangles = [];
    for (var i = 0; i < tris.length; ++i)
    {
        Board.triangles.push({
            vi: [ vertices[tris[i][0]], vertices[tris[i][1]], vertices[tris[i][2]] ],
            ni: [ getEdge(tris[i][0], tris[i][1]),
                  getEdge(tris[i][1], tris[i][2]),
                  getEdge(tris[i][2], tris[i][0]) ]
        });
    }
    function divide()
    {
        function unitAverage(u, v)
        {
            var ret = [ u[0] + v[0],
                        u[1] + v[1],
                        u[2] + v[2] ];
            var rl = Config.normalize ? 1 / Math.sqrt(ret[0] * ret[0] + ret[1] * ret[1] + ret[2] * ret[2]) : 0.5;
            ret[0] *= rl;
            ret[1] *= rl;
            ret[2] *= rl;
            return ret;
        }
        var newTriangles = [];
        for (var i = 0; i < Board.triangles.length; ++i)
        {
            var triangle = Board.triangles[i];
            var v0 = triangle.vi[0];
            var v1 = triangle.vi[1];
            var v2 = triangle.vi[2];
            var v3 = unitAverage(v0, v2);
            var v4 = unitAverage(v0, v1);
            var v5 = unitAverage(v1, v2);
            var e0 = Board.triangles[triangle.ni[0]].ni.indexOf(i);
            var e1 = Board.triangles[triangle.ni[1]].ni.indexOf(i);
            var e2 = Board.triangles[triangle.ni[2]].ni.indexOf(i);
            //        v0
            //  e2   /  \   e0
            //     v3  - v4
            //     /  \ /  \
            //    v2 -v5 - v1
            //        e1
            var ti = newTriangles.length; // i * 4
            var n0 = triangle.ni[0] * 4;
            var n1 = triangle.ni[1] * 4;
            var n2 = triangle.ni[2] * 4;
            newTriangles.push(
                { vi: [ v0, v4, v3 ], ni: [ n0 + ((e0 + 1) % 3), ti + 3, n2 + e2 ] },
                { vi: [ v4, v1, v5 ], ni: [ n0 + e0, n1 + ((e1 + 1) % 3), ti + 3 ] },
                { vi: [ v3, v5, v2 ], ni: [ ti + 3, n1 + e1, n2 + ((e2 + 1) % 3) ] },
                { vi: [ v3, v4, v5 ], ni: [ ti + 0, ti + 1, ti + 2 ] });
        }
        Board.triangles = newTriangles;
    }
    for (var i = 0; i < Config.divisions; ++i)
    {
        divide();
    }

    function sub(a,b)
    {
        return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
    }
    function dot(a,b)
    {
        return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    }
    function distance(a,b) { var d = sub(a,b); return Math.sqrt(dot(d,d)); }
    function uv(ic,t,b,v,ir)
    {
        var c = sub(v,ic);
        return [dot(c,t)/ir,dot(c,b)/ir];
    }

    var bins = 20;
    Board.lookup = [];
    for (var i = 0; i < bins; ++i)
    {
        Board.lookup[i] = [];
        for (var j = 0; j < bins; ++j)
        {
            Board.lookup[i][j] = [];
        }
    }

    Board.state = new Float32Array(Math.ceil(Board.triangles.length / 4) * 4);

    Board.maxLayback = 1.0;
    Board.stride = 9;
    Board.vertexBuffer = new Float32Array(Board.triangles.length * 3 * Board.stride);
    for (var i = 0; i < Board.triangles.length; ++i)
    {
        Board.state[i] = i % 17;
        var v0 = Board.triangles[i].vi[0];
        var v1 = Board.triangles[i].vi[1];
        var v2 = Board.triangles[i].vi[2];
        var x = (v0[0] + v1[0] + v2[0]) / 3;
        var y = (v0[1] + v1[1] + v2[1]) / 3;
        var z = (v0[2] + v1[2] + v2[2]) / 3;
        Board.maxLayback = Math.min(Board.maxLayback, Math.sqrt(x * x + y * y + z * z));

        var sides = [distance(v1, v2), distance(v2, v0), distance(v0, v1)];
        var p = sides[0]+sides[1]+sides[2];
        var s = p/2;
        var area = Math.sqrt(s*(s-sides[0])*(s-sides[1])*(s-sides[2]));

        var ic = [(v0[0] * sides[0] + v1[0] * sides[1] + v2[0] * sides[2]) / p,
                  (v0[1] * sides[0] + v1[1] * sides[1] + v2[1] * sides[2]) / p,
                  (v0[2] * sides[0] + v1[2] * sides[1] + v2[2] * sides[2]) / p];
        var ir = area / s;

        var n = unit(cross(sub(v1,v0),sub(v2,v0)));
        if (n[0] == 0 && n[2] == 0) throw "";
        var t = unit([-n[2],0,n[0]]);
        var b = cross(n,t);

        var iuv = [uv(ic,t,b,v0,ir),
                   uv(ic,t,b,v1,ir),
                   uv(ic,t,b,v2,ir)];

        for (var j = 0; j < 3; ++j)
        {
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 0] = Board.triangles[i].vi[j][0]; // vertex
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 1] = Board.triangles[i].vi[j][1];
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 2] = Board.triangles[i].vi[j][2];
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 3] = i * 3 + j; // triangle index + vertex index in triangle together
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 4] = sides[0]; // side lengths for conversion from barycentric to trilinear and back
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 5] = sides[1]; // for edge rendering
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 6] = sides[2];
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 7] = iuv[j][0];
            Board.vertexBuffer[(i * 3 + j) * Board.stride + 8] = iuv[j][1];
        }
    }

    return Board;
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
    timer: 0,
    proj:     [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    rotation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
};

var MouseButtons = {
    LEFT   : 0,
    MIDDLE : 1,
    RIGHT  : 2
};
var Input = (function(){
    var Input = {
        mouseDown: {},
        dragging: false,
        dragStart: [0, 0],
        mousePos: [0, 0]
    };
    for (var button in MouseButtons)
    {
        Input.mouseDown[MouseButtons[button]] = false;
    }

    document.addEventListener('contextmenu', function(e)
    {
        e.preventDefault();
    }, false);
    document.addEventListener('mousedown', function (e)
    {
        Input.mousePos = [e.clientX, e.clientY];
        Input.mouseDown[e.button] = true;
        if (!Input.dragging)
        {
            Input.dragStart = [e.clientX, e.clientY];
        }
    }, false);
    document.addEventListener('mouseover', function (e)
    {
        Input.mousePos = [e.clientX, e.clientY];
    }, false);
    document.addEventListener('mousemove', function (e)
    {
        Input.mousePos = [e.clientX, e.clientY];
        var down = Input.mouseDown[MouseButtons.LEFT] ||
                   Input.mouseDown[MouseButtons.MIDDLE] ||
                   Input.mouseDown[MouseButtons.RIGHT];
        if (!Input.dragging && down)
        {
            var dx = e.clientX - Input.dragStart[0];
            var dy = e.clientY - Input.dragStart[1];
            if (dx * dx + dy * dy > 5 * 5)
            {
                Input.dragStart = [e.clientX, e.clientY];
                Input.dragRot = rot(Input.dragStart);
                Input.dragging = true;
            }
        }
    }, false);
    document.addEventListener('mouseup', function (e)
    {
        Input.mousePos = [e.clientX, e.clientY];
        Input.mouseDown[e.button] = false;
        var down = Input.mouseDown[MouseButtons.LEFT] ||
                   Input.mouseDown[MouseButtons.MIDDLE] ||
                   Input.mouseDown[MouseButtons.RIGHT];
        if (Input.dragging && !down)
        {
            Input.dragging = false;
        }
    }, false);

    return Input;
})();

function screenDir(screenPos)
{
    var canvas = document.getElementById("canvas");
    var ndc = [  screenPos[0] / canvas.width  * 2 - 1,
               -(screenPos[1] / canvas.height * 2 - 1) ];
    return unit([ ndc[0] / State.proj[0], ndc[1] / State.proj[5], -1]);
}

function rot(screenPos)
{
    var dir = screenDir(screenPos);
    // u + tv ^ 2 = 1
    // t^2 + 2tu.v + u^2 = 1
    var a = 1;
    var b = 2 * dir[2] * State.layback;
    var c = State.layback * State.layback - 1;
    var det = Math.sqrt(b * b - 4 * a * c);
    var t = (-b + det) / 2;
    dir[0] *= t;
    dir[1] *= t;
    dir[2] = (State.layback + dir[2] * t);
    var side = unit([-dir[2], 0, dir[0]]);
    var up = cross(dir, side);
    return [side[0], side[1], side[2], 0,
            up[0], up[1], up[2], 0,
            dir[0], dir[1], dir[2], 0,
            0, 0, 0, 1];
}
function inv(m)
{
    var A0 = ((m[0] * m[5]) - (m[1] * m[4]));
    var A1 = ((m[0] * m[6]) - (m[2] * m[4]));
    var A2 = ((m[0] * m[7]) - (m[3] * m[4]));
    var A3 = ((m[1] * m[6]) - (m[2] * m[5]));
    var A4 = ((m[1] * m[7]) - (m[3] * m[5]));
    var A5 = ((m[2] * m[7]) - (m[3] * m[6]));
    var B0 = ((m[8] * m[13]) - (m[9] * m[12]));
    var B1 = ((m[8] * m[14]) - (m[10] * m[12]));
    var B2 = ((m[8] * m[15]) - (m[11] * m[12]));
    var B3 = ((m[9] * m[14]) - (m[10] * m[13]));
    var B4 = ((m[9] * m[15]) - (m[11] * m[13]));
    var B5 = ((m[10] * m[15]) - (m[11] * m[14]));

    var det = ((A0 * B5) - (A1 * B4) + (A2 * B3) + (A3 * B2) - (A4 * B1) + (A5 * B0));
    var detrecp = 1.0 / det;
    return [
            (+( m[5] * B5) - ( m[6] * B4) + ( m[7] * B3)) * detrecp,
            (-( m[1] * B5) + ( m[2] * B4) - ( m[3] * B3)) * detrecp,
            (+(m[13] * A5) - (m[14] * A4) + (m[15] * A3)) * detrecp,
            (-( m[9] * A5) + (m[10] * A4) - (m[11] * A3)) * detrecp,
            (-( m[4] * B5) + ( m[6] * B2) - ( m[7] * B1)) * detrecp,
            (+( m[0] * B5) - ( m[2] * B2) + ( m[3] * B1)) * detrecp,
            (-(m[12] * A5) + (m[14] * A2) - (m[15] * A1)) * detrecp,
            (+( m[8] * A5) - (m[10] * A2) + (m[11] * A1)) * detrecp,
            (+( m[4] * B4) - ( m[5] * B2) + ( m[7] * B0)) * detrecp,
            (-( m[0] * B4) + ( m[1] * B2) - ( m[3] * B0)) * detrecp,
            (+(m[12] * A4) - (m[13] * A2) + (m[15] * A0)) * detrecp,
            (-( m[8] * A4) + ( m[9] * A2) - (m[11] * A0)) * detrecp,
            (-( m[4] * B3) + ( m[5] * B1) - ( m[6] * B0)) * detrecp,
            (+( m[0] * B3) - ( m[1] * B1) + ( m[2] * B0)) * detrecp,
            (-(m[12] * A3) + (m[13] * A1) - (m[14] * A0)) * detrecp,
            (+( m[8] * A3) - ( m[9] * A1) + (m[10] * A0)) * detrecp
    ];
}
function mul(a, b)
{
    return [ a[0] * b[0] +  a[1] * b[4] +  a[2] *  b[8] +  a[3] * b[12],
             a[0] * b[1] +  a[1] * b[5] +  a[2] *  b[9] +  a[3] * b[13],
             a[0] * b[2] +  a[1] * b[6] +  a[2] * b[10] +  a[3] * b[14],
          /* a[0] * b[3] +  a[1] * b[7] +  a[2] * b[11] +  a[3] * b[15]*/ 0,
             a[4] * b[0] +  a[5] * b[4] +  a[6] *  b[8] +  a[7] * b[12],
             a[4] * b[1] +  a[5] * b[5] +  a[6] *  b[9] +  a[7] * b[13],
             a[4] * b[2] +  a[5] * b[6] +  a[6] * b[10] +  a[7] * b[14],
          /* a[4] * b[3] +  a[5] * b[7] +  a[6] * b[11] +  a[7] * b[15]*/ 0,
             a[8] * b[0] +  a[9] * b[4] + a[10] *  b[8] + a[11] * b[12],
             a[8] * b[1] +  a[9] * b[5] + a[10] *  b[9] + a[11] * b[13],
             a[8] * b[2] +  a[9] * b[6] + a[10] * b[10] + a[11] * b[14],
          /* a[8] * b[3] +  a[9] * b[7] + a[10] * b[11] + a[11] * b[15]*/ 0,
          /*a[12] * b[0] + a[13] * b[4] + a[14] *  b[8] + a[15] * b[12]*/ 0,
          /*a[12] * b[1] + a[13] * b[5] + a[14] *  b[9] + a[15] * b[13]*/ 0,
          /*a[12] * b[2] + a[13] * b[6] + a[14] * b[10] + a[15] * b[14]*/ 0,
          /*a[12] * b[3] + a[13] * b[7] + a[14] * b[11] + a[15] * b[15]*/ 1 ];
}
function unit(x)
{
    var nl = 1/Math.sqrt(x[0]*x[0]+x[1]*x[1]+x[2]*x[2]);
    return [x[0]*nl, x[1]*nl, x[2]*nl, 0];
}
function cross(a, b)
{
    return [a[1]*b[2]-a[2]*b[1],
            a[2]*b[0]-a[0]*b[2],
            a[0]*b[1]-a[1]*b[0],
            0];
}
function norm(a)
{
    var z = unit([a[8],a[9],a[10]]);
    var y = [a[4],a[5], a[6]];
    var x = unit(cross(y,z));
    y = unit(cross(z,x));
    return [x[0],x[1],x[2],0,
            y[0],y[1],y[2],0,
            z[0],z[1],z[2],0,
            0, 0, 0, 1];
}
function axisRotate(axis, cos, sin)
{
    var u = axis[0];
    var v = axis[1];
    var w = axis[2];
    return [u*u + (1-u*u)*cos, u*v*(1-cos)-w*sin, u*w*(1-cos)+v*sin, 0,
            u*v*(1-cos)+w*sin, v*v+(1-v*v)*cos, v*w*(1-cos)-u*sin, 0,
            u*w*(1-cos)-v*sin, v*w*(1-cos)+u*sin, w*w+(1-w*w)*cos, 0,
            0, 0, 0, 1];
}

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

    State.layback = Board.maxLayback * Config.layback;

    if (Input.dragging)
    {
        var newRot = rot(Input.mousePos);

        // spin newRot about it's z-axis to induce the smallest rotation possible based on last rotation matrix
        var dotX = (Input.dragRot[0]*newRot[0]+Input.dragRot[1]*newRot[1]+Input.dragRot[2]*newRot[2]);
        var dotY = (Input.dragRot[4]*newRot[0]+Input.dragRot[5]*newRot[1]+Input.dragRot[6]*newRot[2]);
        newRot = mul(newRot, axisRotate([newRot[8], newRot[9], newRot[10]], dotX, dotY));

        var offset = mul(inv(Input.dragRot), newRot);
        Input.dragRot = newRot;
        Input.dragStart = Input.mousePos.concat();
        State.rotation = mul(State.rotation, offset);
        State.rotation = norm(State.rotation);
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
        precision highp float; \n\
        uniform mat4 projection; \n\
        uniform mat4 rotation; \n\
        uniform float layback; \n\
        uniform vec4 state[" + (Board.state.length / 4) + "];\n\
        uniform vec4 mask[4]; \n\
        \n\
        attribute vec4 position; \n\
        attribute vec3 meta; \n\
        attribute vec2 inuv; \n\
        \n\
        varying vec3 outpos; \n\
        varying vec3 uvw; \n\
        varying vec2 outuv; \n\
        varying float border; \n\
        varying float tindex; \n\
        \n\
        void main() \n\
        { \n\
            vec4 pos = rotation * vec4(position.xyz, 1.0); \n\
            pos.z -= layback; \n\
            gl_Position = projection * pos; \n\
            float k = fract(position.w * (1.0 / 3.0)) * 3.0; \n\
            vec3 bary = k < 0.5 ? vec3(1, 0, 0) : k < 1.5 ? vec3(0, 1, 0) : vec3(0, 0, 1); \n\
            vec3 tril = bary / meta.xyz; \n\
            float s = 0.5*(meta.x+meta.y+meta.z); \n\
            float area = sqrt(s*(s-meta.x)*(s-meta.y)*(s-meta.z)); \n\
            border = 0.1*sqrt(area); \n\
            vec3 dist = tril * 2.0 * area / dot(tril, meta.xyz); \n\
            uvw = dist; \n\
            outuv = inuv; \n\
            outpos = position.xyz; \n\
            float tri = floor(position.w / 3.0); \n\
            tindex = dot(state[int(floor(tri * 0.25))], mask[int(fract(tri * 0.25) * 4.0)]); \n\
        } \n\
    ");
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return alert(gl.getShaderInfoLog(vs));

    gl.getExtension("OES_standard_derivatives");
    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, "#extension GL_OES_standard_derivatives : enable\n\
        precision highp float; \n\
        varying vec3 outpos; \n\
        varying vec3 uvw; \n\
        varying vec2 outuv; \n\
        varying float border; \n\
        varying float tindex; \n\
        \n\
        uniform sampler2D envmap; \n\
        uniform sampler2D tiles; \n\
        \n\
        void main() \n\
        { \n\
            vec3 dpdx = dFdx(outpos.xyz); \n\
            vec3 dpdy = dFdy(outpos.xyz); \n\
            vec2 px = normalize(vec2(dFdx(uvw.x),dFdy(uvw.x))); \n\
            vec2 py = normalize(vec2(dFdx(uvw.y),dFdy(uvw.y))); \n\
            vec2 pz = normalize(vec2(dFdx(uvw.z),dFdy(uvw.z))); \n\
            float eps = fwidth(uvw.x); \n\
            \n\
            vec3 normal = normalize(-cross(dpdx, dpdy)); \n\
            vec3 tangent = normalize(vec3(-normal.z,0,normal.x)); \n\
            vec3 bitangent = cross(normal, tangent); \n\
            \n\
            float dist = min(uvw.x, min(uvw.y, uvw.z)); \n\
            float edgeStrength = smoothstep(eps, 0.0, dist) * 0.05; \n\
            \n\
            vec3  lighting = texture2D(envmap, vec2(atan( normal.z,  normal.x) * 0.15915494309 + 0.5, asin( normal.y) * 0.31830988618 + 0.5)).xyz; \n\
            \n\
            if (tindex < 0.5) \n\
            { \n\
                vec3 bNormal = normal; \n\
                if      (uvw.x == dist) { bNormal += (tangent * px.x + bitangent * px.y) * 0.65; } \n\
                else if (uvw.y == dist) { bNormal += (tangent * py.x + bitangent * py.y) * 0.65; } \n\
                else                    { bNormal += (tangent * pz.x + bitangent * pz.y) * 0.65; } \n\
                bNormal = normalize(bNormal); \n\
                vec3 bLighting = texture2D(envmap, vec2(atan(bNormal.z, bNormal.x) * 0.15915494309 + 0.5, asin(bNormal.y) * 0.31830988618 + 0.5)).xyz; \n\
                lighting = mix(lighting, bLighting, smoothstep(border, border - eps, dist)); \n\
                edgeStrength = 0.0; \n\
                lighting += vec3(0.1, 0.1, 0.1); \n\
            } \n\
            \n\
            vec3 color = lighting; \n\
            color = mix(color, vec3(0.0, 0.0, 0.0), edgeStrength); \n\
            \n\
            vec2 rot = normalize(vec2(dFdx(outuv.x),dFdy(outuv.x))); \n\
            vec2 uv = vec2(dot(rot,outuv),dot(vec2(-rot.y,rot.x),outuv)); \n\
            uv = clamp(uv*0.5+0.5,vec2(0,0),vec2(1,1)); \n\
            \n\
            float tind = floor(mod(tindex+0.01,16.0)); \n\
            vec2 uvOffset = vec2(fract(tind*0.25), floor(tind*0.25)*0.25); \n\
            vec4 tex = texture2D(tiles, uv*0.25 + uvOffset); \n\
            color = mix(color,tex.rgb,tex.a); \n\
            \n\
            gl_FragColor = vec4(color, 1.0); \n\
        } \n\
    ");
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return alert(gl.getShaderInfoLog(fs));

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return alert("oops link");

    var envmap = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, envmap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([255, 0, 0, 255])); // red
    envmap.image = new Image();
    envmap.image.onload = function ()
    {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, envmap);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, envmap.image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    };
    envmap.image.src = "envmap.jpg";

    var tiles = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tiles);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([255, 0, 0, 255])); // red
    tiles.image = new Image();
    tiles.image.onload = function ()
    {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tiles);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tiles.image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
    };
    tiles.image.src = Config.tiles;

    Render.program = program;
    Render.envmap = envmap;
    Render.tiles = tiles;
    Render.vb = gl.createBuffer();

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, Render.vb);
    gl.bufferData(gl.ARRAY_BUFFER, Board.vertexBuffer, gl.STATIC_DRAW);
    var posAttr = gl.getAttribLocation(program, "position");
    var metaAttr = gl.getAttribLocation(program, "meta");
    var uvAttr = gl.getAttribLocation(program, "inuv");
    gl.enableVertexAttribArray(posAttr);
    gl.enableVertexAttribArray(metaAttr);
    gl.enableVertexAttribArray(uvAttr);
    gl.vertexAttribPointer(posAttr,  4, gl.FLOAT, false, Board.stride * 4, 0 * 4);
    gl.vertexAttribPointer(metaAttr, 3, gl.FLOAT, false, Board.stride * 4, 4 * 4);
    gl.vertexAttribPointer(uvAttr,   2, gl.FLOAT, false, Board.stride * 4, 7 * 4);

    var envsampler = gl.getUniformLocation(program, "envmap");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, envmap);
    gl.uniform1i(envsampler, 0);

    var tilesampler = gl.getUniformLocation(program, "tiles");
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tiles);
    gl.uniform1i(tilesampler, 1);

    Render.projection = gl.getUniformLocation(program, "projection");
    Render.rotation = gl.getUniformLocation(program, "rotation");
    Render.layback = gl.getUniformLocation(program, "layback");
    Render.state = gl.getUniformLocation(program, "state");

    var mask = gl.getUniformLocation(program, "mask");
    gl.uniform4fv(mask, new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]));
};

function renderMain()
{
    var canvas = document.getElementById("canvas");
    var gl = canvas.getContext("webgl");

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1, 1, 1, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var near = 0.001;
    var far = 10.0;
    var fov = Config.fov * Math.PI / 180;
    var aspect = canvas.width / canvas.height;
    var f = Math.tan(Math.PI * 0.5 - 0.5 * fov);
    var ri = 1 / (near - far);
    State.proj = [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * ri, -1,
        0, 0, 2 * near * far * ri, 0];
    gl.uniformMatrix4fv(Render.projection, false, new Float32Array(State.proj));
    gl.uniformMatrix4fv(Render.rotation, false, new Float32Array(State.rotation));
    gl.uniform1f(Render.layback, State.layback);
    gl.uniform4fv(Render.state, Board.state);

    gl.drawArrays(gl.TRIANGLES, 0, Board.triangles.length * 3);
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
    Render.init();
    mainloop();
}
window.addEventListener('load', startup);
