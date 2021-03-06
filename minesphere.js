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
        mines: query_string["mines"] || 200,
        fov: query_string["fov"] || 90,
        layback: query_string["layback"] || 0.5,
        normalize: !query_string["dont_normalize"],
        tiles: query_string["tiles"] || "tiles_en.png"
    };
})();

var PlayState = {
    START  : 0,
    PlAYING: 1,
    WON    : 2,
    LOST   : 3
};
var InputState = {
    IDLE    : 0,
    TOGGLE  : 1,
    SURROUND: 2,
    WAITING : 3
};
var State = {
    state: PlayState.START,
    minesRemaining: 0,
    startTime: 0,
    timer: 0,
    proj:     [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    rotation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    inputState: InputState.IDLE
};

var Board = (function(){
    var Board = {};
    Board.reset = [];

    Board.MINE = 13;
    Board.FLAG = 14;
    Board.QMARK = 15;
    Board.UNPRESSED = 16;
    Board.PRESSED = 17;

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
    // as well as having an easy way to nterate around vertices
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
            var ret = [ (u[0] + v[0]) * 0.5,
                        (u[1] + v[1]) * 0.5,
                        (u[2] + v[2]) * 0.5 ];
            return Config.normalize ? unit(ret) : ret;
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

    Board.searchTriangles = [];
    for (var i = 0; i < Board.triangles.length; ++i)
    {
        Board.searchTriangles.push({
            index: i,
            planes: calcTriPlanes(Board.triangles[i].vi)
        });
    }

    // iterate the tiles adjacent to this one, including this one (including vertices, aka the visible set of a bomb)
    Board.iter = function (index, cb)
    {
        cb(index);
        var tri = Board.triangles[index];
        var visited = {};
        visited[index] = true;
        for (var i = 0; i < 3; ++i)
        {
            var prev = index;
            var cur = tri.ni[i];
            while (!visited[cur] || prev == index)
            {
                if (!visited[cur])
                {
                    cb(cur);
                    visited[cur] = true;
                }
                var ntri = Board.triangles[cur];
                var ne = ntri.ni.indexOf(prev);
                var next = ntri.ni[(ne + 2) % 3];
                prev = cur;
                cur = next;
            }
        }
    };
    Board.intersect = function (screenPos)
    {
        // as we search for the intersecting triangle
        // we sort the partial list as we go to try and improve performance over time
        // making the assumption that screenPos/rotation doesn't change 'too' quickly
        // (since player will scroll the rotation, or scroll the mouse, not randomnly
        //  jump and move the sphere at random large rotational intervals)
        //
        // we sort the triangles by 'distance from plane' so that triangles for which
        // the point is furthest behind come first in the list as a good hueristic on
        // where the itnersecting triangle will be (but not precise of course or else
        // we'd just do that for the intersection!). using the intersection with the
        // true sphere as the seed for the metric.
        var sortPoint = transform(State.rotation, intersect(screenPos));
        var dir = transform(State.rotation, screenDir(screenPos));
        var pos = transform(State.rotation, [0, 0, State.layback, 1]);
        for (var i = 0; i < Board.searchTriangles.length; ++i)
        {
            var cand = Board.searchTriangles[i];
            var s = cand.planes;

            if (i > 0)
            {
                cand.sortMetric = s.plane.d - dot(sortPoint, s.plane.n);
                var j = i - 1;
                while (j >= 0 && Board.searchTriangles[j].sortMetric > cand.sortMetric)
                {
                    Board.searchTriangles[j + 1] = Board.searchTriangles[j];
                    --j;
                }
                Board.searchTriangles[j + 1] = cand;
            }

            var t = (s.plane.d - dot(pos, s.plane.n)) / dot(dir, s.plane.n);
            if (t <= 0)
            {
                continue;
            }
            var p = [pos[0] + dir[0]*t, pos[1] + dir[1]*t, pos[2] + dir[2]*t];
            var all = true;
            for (var k = 0; k < s.edges.length; ++k)
            {
                if (dot(s.edges[k].n, p) < s.edges[k].d)
                {
                    all = false;
                    break;
                }
            }
            if (all)
            {
                return cand.index;
            }
        }
        return -1;
    };

    function uv(ic,t,b,v,ir)
    {
        var c = sub(v,ic);
        return [dot(c,t)/ir,dot(c,b)/ir];
    }

    // state is visible, and passed to shader for rendering
    // hiddenState is the 'true' state of the board and never changes, and contains no flags, q-marks or unpressed
    Board.state = new Float32Array(Math.ceil(Board.triangles.length / 4) * 4);
    Board.hiddenState = new Uint8Array(Board.triangles.length);
    if (Config.mines > Board.hiddenState.length)
    {
        window.alert("Too many mines");
    }
    Board.init = function (selectedIndex)
    {
        var bombIndices = [];
        for (var i = 0; i < Board.triangles.length; ++i)
        {
            var j = Math.floor(Math.random() * (i + 1));
            bombIndices[i] = bombIndices[j];
            bombIndices[j] = i;
        }
        for (var i = 0; i < Config.mines; ++i)
        {
            if (bombIndices[i] == selectedIndex)
            {
                bombIndices.splice(i, 1);
                --i;
                continue;
            }
            Board.hiddenState[bombIndices[i]] = Board.MINE;
        }
        // generate counts in hiddenstate
        for (var i = 0; i < Config.mines; ++i)
        {
            Board.iter(bombIndices[i], function (j)
            {
                if (Board.hiddenState[j] != Board.MINE)
                {
                    ++Board.hiddenState[j];
                }
            });
        }
    };

    for (var i = 0; i < Board.triangles.length; ++i)
    {
        Board.state[i] = Board.UNPRESSED;
    }

    Board.reveal = function (index)
    {
        Board.state[index] = Board.hiddenState[index];
        if (Board.hiddenState[index] == 0)
        {
            Board.iter(index, function (neighbour)
            {
                if (index != neighbour && Board.state[neighbour] == Board.UNPRESSED)
                {
                    Board.reveal(neighbour);
                }
            });
        }
        if (Board.state[index] == Board.MINE)
        {
            State.state = PlayState.LOST;
            window.alert(State.state == PlayState.WON ? "YOU WON!" : "HAHA you lose.");
        }
        Board.check();
    };

    Board.check = function ()
    {
        if (State.minesRemaining == 0)
        {
            var anyUnpressed = false;
            for (var i = 0; i < Board.hiddenState.length; ++i)
            {
                if (Board.state[i] == Board.UNPRESSED)
                {
                    anyUnpressed = true;
                    break;
                }
            }
            if (!anyUnpressed)
            {
                State.state = PlayState.WON;
                for (var i = 0; i < Board.hiddenState.length; ++i)
                {
                    var expected = Board.state[i];
                    Board.state[i] = Board.hiddenState[i];
                    if (Board.state[i] == Board.MINE && expected != Board.FLAG)
                    {
                        State.state = PlayState.LOST;
                    }
                    else if (Board.state[i] == Board.MINE)
                    {
                        Board.state[i] = Board.FLAG;
                    }
                }
                window.alert(State.state == PlayState.WON ? "YOU WON!" : "HAHA you lose.");
            }
        }
    };

    Board.maxLayback = 1.0;
    Board.stride = 9;
    Board.vertexBuffer = new Float32Array(Board.triangles.length * 3 * Board.stride);
    for (var i = 0; i < Board.triangles.length; ++i)
    {
        var v0 = Board.triangles[i].vi[0];
        var v1 = Board.triangles[i].vi[1];
        var v2 = Board.triangles[i].vi[2];

        var ave = ave3(Board.triangles[i].vi);
        Board.maxLayback = Math.min(Board.maxLayback, Math.sqrt(dot(ave,ave)));

        var sides = [distance(v1, v2), distance(v2, v0), distance(v0, v1)];
        var p = sides[0]+sides[1]+sides[2];
        var s = p/2;
        var area = Math.sqrt(s*(s-sides[0])*(s-sides[1])*(s-sides[2]));

        var ic = [(v0[0] * sides[0] + v1[0] * sides[1] + v2[0] * sides[2]) / p,
                  (v0[1] * sides[0] + v1[1] * sides[1] + v2[1] * sides[2]) / p,
                  (v0[2] * sides[0] + v1[2] * sides[1] + v2[2] * sides[2]) / p];
        var ir = area / s;

        var n = calcNormal(Board.triangles[i].vi);
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

    State.minesRemaining = parseInt(Config.mines);

    return Board;
})();

var MouseButtons = {
    LEFT   : 0,
    MIDDLE : 1,
    RIGHT  : 2
};
var Input = (function(){
    var Input = {
        mouseDown: {},
        anyMouseUp: false,
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
        if (State.inputState == InputState.IDLE)
        {
            Input.mousePos = [e.clientX, e.clientY];
        }
        Input.mouseDown[e.button] = true;
        if (!Input.dragging)
        {
            Input.dragStart = [e.clientX, e.clientY];
        }
    }, false);
    document.addEventListener('mousemove', function (e)
    {
        var down = Input.mouseDown[MouseButtons.LEFT] ||
                   Input.mouseDown[MouseButtons.MIDDLE] ||
                   Input.mouseDown[MouseButtons.RIGHT];
        if (!Input.dragging && down)
        {
            var dx = e.clientX - Input.dragStart[0];
            var dy = e.clientY - Input.dragStart[1];
            if (dx * dx + dy * dy > 50 * 50)
            {
                Input.dragStart = [e.clientX, e.clientY];
                Input.dragRot = rot(Input.dragStart);
                Input.dragging = true;
            }
        }
        if (Input.dragging)
        {
            Input.mousePos = [e.clientX, e.clientY];
        }
    }, false);
    document.addEventListener('mouseup', function (e)
    {
        Input.anyMouseUp = true;
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
    return unit([ ndc[0] / State.proj[0], ndc[1] / State.proj[5], -1, 0]);
}

function intersect(screenPos)
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
    return unit(dir);
}
function rot(screenPos)
{
    var dir = intersect(screenPos);
    var side = unit([-dir[2], 0, dir[0]]);
    var up = cross(dir, side);
    return [side[0], side[1], side[2], 0,
            up[0], up[1], up[2], 0,
            dir[0], dir[1], dir[2], 0,
            0, 0, 0, 1];
}
function sub(a,b)
{
    return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
}
function dot(a,b)
{
    return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}
function ave3(vs)
{
    return [(vs[0][0] + vs[1][0] + vs[2][0]) / 3,
            (vs[0][1] + vs[1][1] + vs[2][1]) / 3,
            (vs[0][2] + vs[1][2] + vs[2][2]) / 3];
}
function distance(a,b) { var d = sub(a,b); return Math.sqrt(dot(d,d)); }
function calcTriPlanes(vs)
{
    var n = calcNormal(vs);
    function plane(v0, v1)
    {
        var dir = cross(sub(v1, v0), n);
        return { n: dir, d: dot(dir, v0) };
    }
    return { plane: { n: n, d: dot(n, vs[0]) }, edges: [ plane(vs[1],vs[0]), plane(vs[2],vs[1]), plane(vs[0],vs[2]) ] };
}
function calcNormal(vs)
{
    return unit(cross(sub(vs[1],vs[0]),sub(vs[2],vs[0])));
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
function transform(m, v)
{
    return [ m[0]*v[0]+ m[1]*v[1]+ m[2]*v[2]+ m[3]*v[3],
             m[4]*v[0]+ m[5]*v[1]+ m[6]*v[2]+ m[7]*v[3],
             m[8]*v[0]+ m[9]*v[1]+m[10]*v[2]+m[11]*v[3],
            m[12]*v[0]+m[13]*v[1]+m[14]*v[2]+m[15]*v[3]];
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

    // reset additional board state values.
    for (var i = 0; i < Board.reset.length; ++i)
    {
        Board.state[Board.reset[i]] = Board.state[Board.reset[i]] % 17;
    }
    Board.reset = [];

    if (State.state == PlayState.START || State.state == PlayState.PLAYING)
    {
        var selectedIndex = Board.intersect(Input.mousePos);
        if (State.inputState == InputState.IDLE)
        {
            if (!Input.dragging)
            {
                if (Input.mouseDown[MouseButtons.RIGHT])
                {
                    // toggle a flag
                    if (selectedIndex != -1 &&
                        (Board.state[selectedIndex] == Board.UNPRESSED ||
                         Board.state[selectedIndex] == Board.FLAG))
                    {
                        Board.state[selectedIndex] = Board.state[selectedIndex] == Board.UNPRESSED ? Board.FLAG : Board.UNPRESSED;
                        State.inputState = InputState.WAITING;
                        State.minesRemaining += Board.state[selectedIndex] == Board.UNPRESSED ? 1 : -1;
                        Board.check();
                    }
                }
                if (Input.mouseDown[MouseButtons.LEFT])
                {
                    State.inputState = InputState.TOGGLE;
                }
                if (Input.mouseDown[MouseButtons.MIDDLE])
                {
                    State.inputState = InputState.SURROUND;
                }
            }
        }
        else if (State.inputState == InputState.TOGGLE)
        {
            if (Input.mouseDown[MouseButtons.MIDDLE] || Input.mouseDown[MouseButtons.RIGHT])
            {
                State.inputState = InputState.SURROUND;
            }
            else if (!Input.mouseDown[MouseButtons.LEFT])
            {
                // reveal tile if not a flag
                if (selectedIndex != -1 &&
                    Board.state[selectedIndex] == Board.UNPRESSED)
                {
                    if (State.state != PlayState.PLAYING)
                    {
                        State.state = PlayState.PLAYING;
                        State.startTime = Date.now() - 1000; // start at 1
                        Board.init(selectedIndex);
                    }
                    Board.reveal(selectedIndex);
                }
                State.inputState = InputState.WAITING;
            }
            else if (Input.dragging)
            {
                State.inputState = InputState.WAITING;
            }
            if (selectedIndex != -1 &&
                Board.state[selectedIndex] == Board.UNPRESSED &&
                !Input.dragging)
            {
                Board.state[selectedIndex] += Board.PRESSED;
                Board.reset.push(selectedIndex);
            }
        }
        else if (State.inputState == InputState.SURROUND)
        {
            if (Input.anyMouseUp && !Input.mouseDown[MouseButtons.MIDDLE])
            {
                // reveal any tiles if satisfied
                if (selectedIndex != -1 &&
                    Board.state[selectedIndex] > 0 && Board.state[selectedIndex] < Board.MINE)
                {
                    var countBombs = Board.state[selectedIndex];
                    var countFlags = 0;
                    Board.iter(selectedIndex, function (index)
                    {
                        if (Board.state[index] == Board.FLAG)
                        {
                            ++countFlags;
                        }
                    });
                    if (countFlags == countBombs)
                    {
                        Board.iter(selectedIndex, function (index)
                        {
                            if (Board.state[index] == Board.UNPRESSED)
                            {
                                Board.reveal(index);
                            }
                        });
                    }
                }
                State.inputState = InputState.WAITING;
            }
            else if (Input.dragging)
            {
                State.inputState = InputState.WAITING;
            }
            if (selectedIndex != -1 &&
                !Input.dragging)
            {
                Board.iter(selectedIndex, function (index)
                {
                    if (Board.state[index] == Board.UNPRESSED)
                    {
                        Board.state[index] += Board.PRESSED;
                        Board.reset.push(index);
                    }
                });
            }
        }
        else
        {
            if (!Input.mouseDown[MouseButtons.LEFT] &&
                !Input.mouseDown[MouseButtons.MIDDLE] &&
                !Input.mouseDown[MouseButtons.RIGHT])
            {
                State.inputState = InputState.IDLE;
            }
        }
    }
    Input.anyMouseUp = false;

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
            outpos = (rotation * vec4(position.xyz, 1.0)).xyz; \n\
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
            if (tindex < 13.5) \n\
            { \n\
                normal = normalize(outpos + normal); \n\
            } \n\
            vec3  lighting = texture2D(envmap, vec2(atan( normal.z,  normal.x) * 0.15915494309 + 0.5, asin( normal.y) * 0.31830988618 + 0.5)).xyz; \n\
            \n\
            if (tindex > 13.5 && tindex < 16.5) \n\
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
            float tind = floor(tindex+0.01); \n\
            tind = tind > 15.5 ? 0.0 : tind; \n\
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
        f , 0, 0, 0,
        0, f * aspect, 0, 0,
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
        var str = (Math.floor(value)).toString();
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
