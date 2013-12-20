;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict"

var iota = require("iota-array")
var deck = require("deck")
var orientation = require("robust-orientation")
var pointInSimplex = require("robust-point-in-simplex")
var inSphere = require("robust-in-sphere")
var sc = require("simplicial-complex")

module.exports = createDelaunayTriangulation

function Simplex(triangulation, vertices, children, next, prev) {
  this.triangulation = triangulation
  this.vertices = vertices
  this.children = children
  this.next = next
  this.prev = prev
}

var proto = Simplex.prototype

proto.insert = function(p) {
  if(this.children) {
    for(var i=0; i<this.children.length; ++i) {
      if(this.children[i].contains(this.triangulation.points[p])) {
        this.children[i].insert(p)
      }
    }
  } else {
    //Unlink from list
    this.prev.next = this.next
    this.next.prev = this.prev
    this.next = this.prev = null
    //Add child
    this.children = []
    for(var i=this.vertices.length-1; i>=0; --i) {
      //Remove from dual
      var v = this.vertices[i]
      var d = this.triangulation._dual[v]
      for(var j=d.length-1; j>=0; --j) {
        if(d[j] === this) {
          d[j] = d[d.length-1]
          d.pop()
          break
        }
      }
      //Add child
      var nv = this.vertices.slice()
      nv[i] = p
      var child = new Simplex(this.triangulation, nv, null, this.triangulation.next, this.triangulation)
      if(!child.degenerate()) {
        this.children.push(child)
        this.triangulation.next.prev = child
        this.triangulation.next = child
        for(var j=0; j<nv.length; ++j) {
          this.triangulation._dual[nv[j]].push(child)
        }
      }
    }
  }
}

proto.contains = function(p) {
  var pointList = new Array(this.vertices.length)
  for(var i=0; i<this.vertices.length; ++i) {
    pointList[i] = this.triangulation.points[this.vertices[i]]
  }
  return pointInSimplex(pointList, p) >= 0
}

proto.degenerate = function() {
  var pointList = new Array(this.vertices.length)
  for(var i=0; i<this.vertices.length; ++i) {
    pointList[i] = this.triangulation.points[this.vertices[i]]
  }
  return orientation(pointList) === 0
}

function DelaunayTriangulation(points, dual, root) {
  this.points = points
  this._dual = dual
  this._root = root
  this.next = this
  this.prev = this
}

var dproto = DelaunayTriangulation.prototype


dproto.dual = function(v) {
  var d = this._dual[v]
  var r = []
  for(var i=0; i<d.length; ++i) {
    r.push(d[i].vertices)
  }
  return r
}

function removeFromDual(triangulation, simplex) {
  for(var i=0; i<simplex.vertices.length; ++i) {
    var d = triangulation._dual[simplex.vertices[i]]
    for(var j=0; j<d.length; ++j) {
      if(d[j] === simplex) {
        d[j] = d[d.length-1]
        d.pop()
        break
      }
    }
  }
}

dproto.insert = function(p) {
  var v = this.points.length
  this.points.push(p)
  this._dual.push([])
  this._root.insert(v)
  //Fix up delaunay condition
  var to_visit = this._dual[v].slice()
  while(to_visit.length > 0) {
    var c = to_visit[to_visit.length-1]
    to_visit.pop()
    if(c.children) {
      continue
    }
    //Get opposite simplex
    var points = new Array(c.vertices.length+1)
    var v_sum = 0
    for(var i=0; i<c.vertices.length; ++i) {
      points[i] = this.points[c.vertices[i]]
      v_sum ^= c.vertices[i]
    }
    //Walk over simplex vertices
do_flip:
    for(var i=0; i<c.vertices.length; ++i) {
      //Find opposite simplex to vertex i
      if(c.vertices[i] !== v) {
        continue
      }
      var d = this._dual[c.vertices[(i+1)%c.vertices.length]]
      var opposite
      var opposite_index
search_opposite:
      for(var j=0; j<d.length; ++j) {
        opposite = d[j]
        if(opposite === c) {
          continue
        }
        opposite_index = v_sum ^ v
        for(var k=0; k<opposite.vertices.length; ++k) {
          opposite_index ^= opposite.vertices[k]
          if(c.vertices[k] !== v && opposite.vertices.indexOf(c.vertices[k]) < 0) {
            continue search_opposite
          }
        }
        //Check if legal
        points[c.vertices.length] = this.points[opposite_index]
        var s = inSphere(points)
        if(inSphere(points) > 0) {
          //Unlink cells
          removeFromDual(this, c)
          c.children = []
          c.next.prev = c.prev
          c.prev.next = c.next
          c.next = c.prev = null
          removeFromDual(this, opposite)
          opposite.children = []
          opposite.next.prev = opposite.prev
          opposite.prev.next = opposite.next
          opposite.next = opposite.prev = null
          for(var k=0; k<c.vertices.length; ++k) {
            if(c.vertices[k] === v) {
              continue
            }
            var nv = c.vertices.slice()
            nv[k] = opposite_index
            //Create and link cell
            var nchild = new Simplex(this, nv, null, this.next, this)
            this.next.prev = nchild
            this.next = nchild
            for(var l=0; l<nv.length; ++l) {
              this._dual[nv[l]].push(nchild)
            }
            //Add to child pointers
            c.children.push(nchild)
            opposite.children.push(nchild)
            //Mark to visit
            to_visit.push(nchild)
          }
        }
        break do_flip
      }
    }
  }
}

dproto.locate = function(p) {
  var c = this._root
  while(c.children) {
    for(var i=0; i<c.children.length; ++i) {
      if(c.children[i].contains(p)) {
        c = c.children[i]
        break
      }
    }
  }
  return c.vertices
}

Object.defineProperty(dproto, "cells", {
  get: function() {
    var r = []
    for(var cur=this.next; cur !== this; cur = cur.next) {
      r.push(cur.vertices)
    }
    return r
  }
})

function createBoundingSimplex(dimension) {
  var result = new Array(dimension+1)
  for(var i=0; i<=dimension; ++i) {
    result[i] = new Array(dimension)
  }
  for(var i=1; i<=dimension; ++i) {
    result[i][i-1] = 1e30
    for(var j=0; j<i-1; ++j) {
      result[i][j] = 0.0
    }
    for(var j=0; j<i; ++j) {
      result[j][i-1] = -1e30
    }
  }
  return result
}

function createDelaunayTriangulation(dimension, points) {
  var bounds = createBoundingSimplex(dimension)
  var root = new Simplex(null, iota(dimension+1), null, null, null)
  var dual = new Array(dimension+1)
  for(var i=0; i<dual.length; ++i) {
    dual[i] = [root]
  }
  var triangulation = new DelaunayTriangulation(bounds, dual, root)
  root.triangulation = triangulation
  root.next = root.prev = triangulation
  triangulation.next = triangulation.prev = root
  if(points) {
    var spoints = deck.shuffle(points)
    for(var i=0; i<spoints.length; ++i) {
      triangulation.insert(spoints[i])
    }
  }
  return triangulation
}
},{"deck":2,"iota-array":3,"robust-in-sphere":4,"robust-orientation":18,"robust-point-in-simplex":19,"simplicial-complex":22}],2:[function(require,module,exports){
var exports = module.exports = function (xs) {
    if (typeof xs !== 'object') { // of which Arrays are
        throw new TypeError('Must be an Array or an object');
    }
    
    return Object.keys(exports).reduce(function (acc, name) {
        acc[name] = exports[name].bind(null, xs);
        return acc;
    }, {});
};

exports.shuffle = function (xs) {
    if (Array.isArray(xs)) {
        // uniform shuffle
        var res = xs.slice();
        for (var i = res.length - 1; i >= 0; i--) {
            var n = Math.floor(Math.random() * i);
            var t = res[i];
            res[i] = res[n];
            res[n] = t;
        }
        return res;
    }
    else if (typeof xs === 'object') {
        // weighted shuffle
        var weights = Object.keys(xs).reduce(function (acc, key) {
            acc[key] = xs[key];
            return acc;
        }, {});
        
        var ret = [];
        
        while (Object.keys(weights).length > 0) {
            var key = exports.pick(weights);
            delete weights[key];
            ret.push(key);
        }
        
        return ret;
    }
    else {
        throw new TypeError('Must be an Array or an object');
    }
};

exports.pick = function (xs) {
    if (Array.isArray(xs)) {
        // uniform sample
        return xs[Math.floor(Math.random() * xs.length)];
    }
    else if (typeof xs === 'object') {
        // weighted sample
        var weights = exports.normalize(xs);
        if (!weights) return undefined;
        
        var n = Math.random();
        var threshold = 0;
        var keys = Object.keys(weights);
        
        for (var i = 0; i < keys.length; i++) {
            threshold += weights[keys[i]];
            if (n < threshold) return keys[i];
        }
        throw new Error('Exceeded threshold. Something is very wrong.');
    }
    else {
        throw new TypeError('Must be an Array or an object');
    }
};

exports.normalize = function (weights) {
    if (typeof weights !== 'object' || Array.isArray(weights)) {
        throw 'Not an object'
    }
    
    var keys = Object.keys(weights);
    if (keys.length === 0) return undefined;
    
    var total = keys.reduce(function (sum, key) {
        var x = weights[key];
        if (x < 0) {
            throw new Error('Negative weight encountered at key ' + key);
        }
        else if (typeof x !== 'number') {
            throw new TypeError('Number expected, got ' + typeof x);
        }
        else {
            return sum + x;
        }
    }, 0);
    
    return total === 1
        ? weights
        : keys.reduce(function (acc, key) {
            acc[key] = weights[key] / total;
            return acc;
        }, {})
    ;
};

},{}],3:[function(require,module,exports){
"use strict"

function iota(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = i
  }
  return result
}

module.exports = iota
},{}],4:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var robustSum = require("robust-sum")
var robustDiff = require("robust-subtract")
var robustScale = require("robust-scale")

module.exports = getInSphere

function cofactor(m, c) {
  var result = new Array(m.length-1)
  for(var i=1; i<m.length; ++i) {
    var r = result[i-1] = new Array(m.length-1)
    for(var j=0,k=0; j<m.length; ++j) {
      if(j === c) {
        continue
      }
      r[k++] = m[i][j]
    }
  }
  return result
}

function matrix(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = new Array(n)
    for(var j=0; j<n; ++j) {
      result[i][j] = ["m[", j, "][", (n-i-2), "]"].join("")
    }
  }
  return result
}

function generateSum(expr) {
  if(expr.length === 1) {
    return expr[0]
  } else if(expr.length === 2) {
    return ["sum(", expr[0], ",", expr[1], ")"].join("")
  } else {
    var m = expr.length>>1
    return ["sum(", generateSum(expr.slice(0, m)), ",", generateSum(expr.slice(m)), ")"].join("")
  }
}

function makeProduct(a, b) {
  if(a.charAt(0) === "m") {
    if(b.charAt(0) === "w") {
      var toks = a.split("]")
      return ["w", b.substr(1), "m", toks[0].substr(2)].join("")
    } else {
      return ["prod(", a, ",", b, ")"].join("")
    }
  } else {
    return makeProduct(b, a)
  }
}

function sign(s) {
  if(s & 1 !== 0) {
    return "-"
  }
  return ""
}

function determinant(m) {
  if(m.length === 2) {
    return [["diff(", makeProduct(m[0][0], m[1][1]), ",", makeProduct(m[1][0], m[0][1]), ")"].join("")]
  } else {
    var expr = []
    for(var i=0; i<m.length; ++i) {
      expr.push(["scale(", generateSum(determinant(cofactor(m, i))), ",", sign(i), m[0][i], ")"].join(""))
    }
    return expr
  }
}

function makeSquare(d, n) {
  var terms = []
  for(var i=0; i<n-2; ++i) {
    terms.push(["prod(m[", d, "][", i, "],m[", d, "][", i, "])"].join(""))
  }
  return generateSum(terms)
}

function orientation(n) {
  var pos = []
  var neg = []
  var m = matrix(n)
  for(var i=0; i<n; ++i) {
    m[0][i] = "1"
    m[n-1][i] = "w"+i
  } 
  for(var i=0; i<n; ++i) {
    if((i&1)===0) {
      pos.push.apply(pos,determinant(cofactor(m, i)))
    } else {
      neg.push.apply(neg,determinant(cofactor(m, i)))
    }
  }
  var posExpr = generateSum(pos)
  var negExpr = generateSum(neg)
  var code = ["function inSphere", n, "(m){"]

  for(var i=0; i<n; ++i) {
    code.push("var w",i,"=",makeSquare(i,n),";")
    for(var j=0; j<n; ++j) {
      if(j !== i) {
        code.push("var w",i,"m",j,"=scale(w",i,",m[",j,"][0]);")
      }
    }
  }

  code.push("var p=", posExpr, ",n=", negExpr, ";\
for(var i=p.length-1,j=n.length-1;i>=0&&j>=0;--i,--j){\
if(p[i]<n[j]){return -1}else if(p[i]>n[j]){return 1}}\
if(i>=0){return p[i]>0?1:(p[i]<0?-1:0)}\
if(j>=0){return n[j]<0?1:(n[j]>0?-1:0)}\
return 0};return inSphere", n)

  var proc = new Function("sum", "diff", "prod", "scale", code.join(""))
  return proc(robustSum, robustDiff, twoProduct, robustScale)
}

var CACHED = [
  function inSphere0() { return 0 },
  function inSphere1() { return 0 },
  function inSphere2() { return 0 },
  function inSphere3(m) { 
    var a = m[0][0], b = m[1][0], c = m[2][0]
    if(a < b) {
      if(a < c) {
        if(c < b) {
          return -1
        } else if(c > b) {
          return 1
        } else {
          return 0
        }
      } else if(a === c) {
        return 0
      } else {
        return 1
      }
    } else {
      if(b < c) {
        if(c < a) {
          return 1
        } else if(c > a) {
          return -1
        } else {
          return 0
        }
      } else if(b === c) {
        return 0
      } else {
        return -1
      }
    }
  }
]

function getInSphere(m) {
  while(CACHED.length <= m.length) {
    CACHED.push(orientation(CACHED.length))
  }
  var p = CACHED[m.length]
  return p(m)
}
},{"robust-scale":6,"robust-subtract":7,"robust-sum":10,"two-product":11}],5:[function(require,module,exports){
"use strict"

module.exports = fastTwoSum

function fastTwoSum(a, b, result) {
	var x = a + b
	var bv = x - a
	var av = x - bv
	var br = b - bv
	var ar = a - av
	if(result) {
		result[0] = ar + br
		result[1] = x
		return result
	}
	return [ar+br, x]
}
},{}],6:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var twoSum = require("two-sum")

module.exports = scaleLinearExpansion

function scaleLinearExpansion(e, scale, result) {
	var n = e.length
	var g
	if(result) {
		g = result
	} else {
		g = new Array(2 * n)
	}
	var q = [0.1, 0.1]
	var t = [0.1, 0.1]
	var count = 0
	twoProduct(e[0], scale, q)
	if(q[0]) {
		g[count++] = q[0]
	}
	for(var i=1; i<n; ++i) {
		twoProduct(e[i], scale, t)
		twoSum(q[1], t[0], q)
		if(q[0]) {
			g[count++] = q[0]
		}
		var a = t[1]
		var b = q[1]
		var x = a + b
		var bv = x - a
		var y = b - bv
		q[1] = x
		if(y) {
			g[count++] = y
		}
	}
	if(q[1]) {
		g[count++] = q[1]
	}
	if(count === 0) {
		g[count++] = 0.0
	}
	if(result) {
    if(count < g.length) {
      var ptr = g.length-1
      count--
      while(count >= 0) {
        g[ptr--] = g[count--]
      }
      while(ptr >= 0) {
        g[ptr--] = 0.0
      }
    }
		return g
	}
	g.length = count
	return g
}
},{"two-product":11,"two-sum":5}],7:[function(require,module,exports){
"use strict"

var sum = require("robust-sum")

module.exports = robustDiff

function robustDiff(a,b) {
  var c = b.slice()
  for(var i=0; i<c.length; ++i) {
    c[i] = -c[i]
  }
  return sum(a,c)
}
},{"robust-sum":10}],8:[function(require,module,exports){
"use strict"

function merge2_cmp(a, b, result, compare) {
  var a_ptr = 0
    , b_ptr = 0
    , r_ptr = 0
  while(a_ptr < a.length && b_ptr < b.length) {
    if(compare(a[a_ptr], b[b_ptr]) <= 0) {
      result[r_ptr++] = a[a_ptr++]
    } else {
      result[r_ptr++] = b[b_ptr++]
    }
  }
  while(a_ptr < a.length) {
    result[r_ptr++] = a[a_ptr++]
  }
  while(b_ptr < b.length) {
    result[r_ptr++] = b[b_ptr++]
  }
}

function merge2_def(a, b, result) {
  var a_ptr = 0
    , b_ptr = 0
    , r_ptr = 0
  while(a_ptr < a.length && b_ptr < b.length) {
    if(a[a_ptr] <= b[b_ptr]) {
      result[r_ptr++] = a[a_ptr++]
    } else {
      result[r_ptr++] = b[b_ptr++]
    }
  }
  while(a_ptr < a.length) {
    result[r_ptr++] = a[a_ptr++]
  }
  while(b_ptr < b.length) {
    result[r_ptr++] = b[b_ptr++]
  }
}

function merge2(a, b, compare, result) {
  if(!result) {
    result = new Array(a.length + b.length)
  }
  if(compare) {
    merge2_cmp(a, b, result, compare)
  } else {
    merge2_def(a, b, result)
  }
  return result
}

module.exports = merge2
},{}],9:[function(require,module,exports){
module.exports=require(5)
},{}],10:[function(require,module,exports){
"use strict"

var twoSum = require("two-sum")
var binaryMerge = require("binary-merge")

module.exports = linearExpansionSum

function compareMagnitudes(a, b) {
  return Math.abs(a) - Math.abs(b)
}

function linearExpansionSum(e, f, result) {
  var g = binaryMerge(e, f, compareMagnitudes, result)
  var n = e.length + f.length
  var count = 0
  var a = g[1]
  var b = g[0]
  var x = a + b
  var bv = x - a
  var y = b - bv
  var q = [y, x]
  for(var i=2; i<n; ++i) {
    a = g[i]
    b = q[0] || 0.0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    twoSum(q[1], x, q)
  }
  if(q[0]) {
    g[count++] = q[0]
  }
  if(q[1]) {
    g[count++] = q[1]
  }
  if(!count) {
    g[count++] = 0.0
  }
  if(result) {
    if(count < g.length) {
      var ptr = g.length-1
      count--
      while(count >= 0) {
        g[ptr--] = g[count--]
      }
      while(ptr >= 0) {
        g[ptr--] = 0.0
      }
    }
  } else {
    g.length = count
  }
  return g
}
},{"binary-merge":8,"two-sum":9}],11:[function(require,module,exports){
"use strict"

module.exports = twoProduct

var HALF_DOUBLE = (1<<26) + 1

function twoProduct(a, b, result) {
	var x = a * b

	var c = HALF_DOUBLE * a
	var abig = c - a
	var ahi = c - abig
	var alo = a - ahi
	
	var d = HALF_DOUBLE * b
	var bbig = d - b
	var bhi = d - bbig
	var blo = b - bhi
	
	var err1 = x - (ahi * bhi)
	var err2 = err1 - (alo * bhi)
	var err3 = err2 - (ahi * blo)
	
	var y = alo * blo - err3

	if(result) {
		result[0] = y || 0.0
		result[1] = x || 0.0
		return result
	}
	
	return [ y || 0.0, x || 0.0 	]
}
},{}],12:[function(require,module,exports){
module.exports=require(5)
},{}],13:[function(require,module,exports){
module.exports=require(6)
},{"two-product":17,"two-sum":12}],14:[function(require,module,exports){
module.exports=require(8)
},{}],15:[function(require,module,exports){
module.exports=require(5)
},{}],16:[function(require,module,exports){
module.exports=require(10)
},{"binary-merge":14,"two-sum":15}],17:[function(require,module,exports){
module.exports=require(11)
},{}],18:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var robustSum = require("robust-sum")
var robustScale = require("robust-scale")

module.exports = getOrientation

function cofactor(m, c) {
  var result = new Array(m.length-1)
  for(var i=1; i<m.length; ++i) {
    var r = result[i-1] = new Array(m.length-1)
    for(var j=0,k=0; j<m.length; ++j) {
      if(j === c) {
        continue
      }
      r[k++] = m[i][j]
    }
  }
  return result
}

function matrix(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = new Array(n)
    for(var j=0; j<n; ++j) {
      result[i][j] = ["m[", j, "][", (n-i-1), "]"].join("")
    }
  }
  return result
}

function sign(n) {
  if(n & 1) {
    return "-"
  }
  return ""
}

function generateSum(expr) {
  if(expr.length === 1) {
    return expr[0]
  } else if(expr.length === 2) {
    return ["sum(", expr[0], ",", expr[1], ")"].join("")
  } else {
    var m = expr.length>>1
    return ["sum(", generateSum(expr.slice(0, m)), ",", generateSum(expr.slice(m)), ")"].join("")
  }
}

function determinant(m) {
  if(m.length === 2) {
    return ["sum(prod(", m[0][0], ",", m[1][1], "),prod(-", m[0][1], ",", m[1][0], "))"].join("")
  } else {
    var expr = []
    for(var i=0; i<m.length; ++i) {
      expr.push(["scale(", determinant(cofactor(m, i)), ",", sign(i), m[0][i], ")"].join(""))
    }
    return generateSum(expr)
  }
}

function orientation(n) {
  var pos = []
  var neg = []
  var m = matrix(n)
  for(var i=0; i<n; ++i) {
    if((i&1)===0) {
      pos.push(determinant(cofactor(m, i)))
    } else {
      neg.push(determinant(cofactor(m, i)))
    }
  }
  var posExpr = generateSum(pos)
  var negExpr = generateSum(neg)
  var code = ["function orientation", n, "(m){var p=", posExpr, ",n=", negExpr, ";\
for(var i=p.length-1,j=n.length-1;i>=0&&j>=0;--i,--j){\
if(p[i]<n[j]){return -1}else if(p[i]>n[j]){return 1}}\
if(i>=0){return p[i]>0?1:(p[i]<0?-1:0)}\
if(j>=0){return n[j]<0?1:(n[j]>0?-1:0)}\
return 0};return orientation", n].join("")
  var proc = new Function("sum", "prod", "scale", code)
  return proc(robustSum, twoProduct, robustScale)
}

var CACHED = [
  function orientation0() { return 0 },
  function orientation1() { return 0 },
  function orientation2(a) { 
    var d = a[0][0] - a[1][0]
    if(d < 0) { return -1 }
    if(d > 0) { return 1 }
    return 0
  }
]

function getOrientation(m) {
  while(CACHED.length <= m.length) {
    CACHED.push(orientation(CACHED.length))
  }
  var p = CACHED[m.length]
  return p(m)
}
},{"robust-scale":13,"robust-sum":16,"two-product":17}],19:[function(require,module,exports){
"use strict"

var orientation = require("robust-orientation")

module.exports = inSimplex

function inSimplex(simplex, point) {
  var s = orientation(simplex)
  var scopy = simplex.slice()
  var boundary = false
  for(var i=0; i<simplex.length; ++i) {
    scopy[i] = point
    var o = orientation(scopy)
    scopy[i] = simplex[i]
    if(o) {
      if(o !== s) {
        return -1
      }
    } else {
      boundary = true
    }
  }
  if(boundary) {
    return 0
  }
  return 1
}
},{"robust-orientation":18}],20:[function(require,module,exports){
/**
 * Bit twiddling hacks for JavaScript.
 *
 * Author: Mikola Lysenko
 *
 * Ported from Stanford bit twiddling hack library:
 *    http://graphics.stanford.edu/~seander/bithacks.html
 */

"use strict"; "use restrict";

//Number of bits in an integer
var INT_BITS = 32;

//Constants
exports.INT_BITS  = INT_BITS;
exports.INT_MAX   =  0x7fffffff;
exports.INT_MIN   = -1<<(INT_BITS-1);

//Returns -1, 0, +1 depending on sign of x
exports.sign = function(v) {
  return (v > 0) - (v < 0);
}

//Computes absolute value of integer
exports.abs = function(v) {
  var mask = v >> (INT_BITS-1);
  return (v ^ mask) - mask;
}

//Computes minimum of integers x and y
exports.min = function(x, y) {
  return y ^ ((x ^ y) & -(x < y));
}

//Computes maximum of integers x and y
exports.max = function(x, y) {
  return x ^ ((x ^ y) & -(x < y));
}

//Checks if a number is a power of two
exports.isPow2 = function(v) {
  return !(v & (v-1)) && (!!v);
}

//Computes log base 2 of v
exports.log2 = function(v) {
  var r, shift;
  r =     (v > 0xFFFF) << 4; v >>>= r;
  shift = (v > 0xFF  ) << 3; v >>>= shift; r |= shift;
  shift = (v > 0xF   ) << 2; v >>>= shift; r |= shift;
  shift = (v > 0x3   ) << 1; v >>>= shift; r |= shift;
  return r | (v >> 1);
}

//Computes log base 10 of v
exports.log10 = function(v) {
  return  (v >= 1000000000) ? 9 : (v >= 100000000) ? 8 : (v >= 10000000) ? 7 :
          (v >= 1000000) ? 6 : (v >= 100000) ? 5 : (v >= 10000) ? 4 :
          (v >= 1000) ? 3 : (v >= 100) ? 2 : (v >= 10) ? 1 : 0;
}

//Counts number of bits
exports.popCount = function(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
}

//Counts number of trailing zeros
function countTrailingZeros(v) {
  var c = 32;
  v &= -v;
  if (v) c--;
  if (v & 0x0000FFFF) c -= 16;
  if (v & 0x00FF00FF) c -= 8;
  if (v & 0x0F0F0F0F) c -= 4;
  if (v & 0x33333333) c -= 2;
  if (v & 0x55555555) c -= 1;
  return c;
}
exports.countTrailingZeros = countTrailingZeros;

//Rounds to next power of 2
exports.nextPow2 = function(v) {
  v += v === 0;
  --v;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v + 1;
}

//Rounds down to previous power of 2
exports.prevPow2 = function(v) {
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v - (v>>>1);
}

//Computes parity of word
exports.parity = function(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v &= 0xf;
  return (0x6996 >>> v) & 1;
}

var REVERSE_TABLE = new Array(256);

(function(tab) {
  for(var i=0; i<256; ++i) {
    var v = i, r = i, s = 7;
    for (v >>>= 1; v; v >>>= 1) {
      r <<= 1;
      r |= v & 1;
      --s;
    }
    tab[i] = (r << s) & 0xff;
  }
})(REVERSE_TABLE);

//Reverse bits in a 32 bit word
exports.reverse = function(v) {
  return  (REVERSE_TABLE[ v         & 0xff] << 24) |
          (REVERSE_TABLE[(v >>> 8)  & 0xff] << 16) |
          (REVERSE_TABLE[(v >>> 16) & 0xff] << 8)  |
           REVERSE_TABLE[(v >>> 24) & 0xff];
}

//Interleave bits of 2 coordinates with 16 bits.  Useful for fast quadtree codes
exports.interleave2 = function(x, y) {
  x &= 0xFFFF;
  x = (x | (x << 8)) & 0x00FF00FF;
  x = (x | (x << 4)) & 0x0F0F0F0F;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;

  y &= 0xFFFF;
  y = (y | (y << 8)) & 0x00FF00FF;
  y = (y | (y << 4)) & 0x0F0F0F0F;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;

  return x | (y << 1);
}

//Extracts the nth interleaved component
exports.deinterleave2 = function(v, n) {
  v = (v >>> n) & 0x55555555;
  v = (v | (v >>> 1))  & 0x33333333;
  v = (v | (v >>> 2))  & 0x0F0F0F0F;
  v = (v | (v >>> 4))  & 0x00FF00FF;
  v = (v | (v >>> 16)) & 0x000FFFF;
  return (v << 16) >> 16;
}


//Interleave bits of 3 coordinates, each with 10 bits.  Useful for fast octree codes
exports.interleave3 = function(x, y, z) {
  x &= 0x3FF;
  x  = (x | (x<<16)) & 4278190335;
  x  = (x | (x<<8))  & 251719695;
  x  = (x | (x<<4))  & 3272356035;
  x  = (x | (x<<2))  & 1227133513;

  y &= 0x3FF;
  y  = (y | (y<<16)) & 4278190335;
  y  = (y | (y<<8))  & 251719695;
  y  = (y | (y<<4))  & 3272356035;
  y  = (y | (y<<2))  & 1227133513;
  x |= (y << 1);
  
  z &= 0x3FF;
  z  = (z | (z<<16)) & 4278190335;
  z  = (z | (z<<8))  & 251719695;
  z  = (z | (z<<4))  & 3272356035;
  z  = (z | (z<<2))  & 1227133513;
  
  return x | (z << 2);
}

//Extracts nth interleaved component of a 3-tuple
exports.deinterleave3 = function(v, n) {
  v = (v >>> n)       & 1227133513;
  v = (v | (v>>>2))   & 3272356035;
  v = (v | (v>>>4))   & 251719695;
  v = (v | (v>>>8))   & 4278190335;
  v = (v | (v>>>16))  & 0x3FF;
  return (v<<22)>>22;
}

//Computes next combination in colexicographic order (this is mistakenly called nextPermutation on the bit twiddling hacks page)
exports.nextCombination = function(v) {
  var t = v | (v - 1);
  return (t + 1) | (((~t & -~t) - 1) >>> (countTrailingZeros(v) + 1));
}


},{}],21:[function(require,module,exports){
"use strict"; "use restrict";

module.exports = UnionFind;

function UnionFind(count) {
  this.roots = new Array(count);
  this.ranks = new Array(count);
  
  for(var i=0; i<count; ++i) {
    this.roots[i] = i;
    this.ranks[i] = 0;
  }
}

UnionFind.prototype.length = function() {
  return this.roots.length;
}

UnionFind.prototype.makeSet = function() {
  var n = this.roots.length;
  this.roots.push(n);
  this.ranks.push(0);
  return n;
}

UnionFind.prototype.find = function(x) {
  var roots = this.roots;
  while(roots[x] !== x) {
    var y = roots[x];
    roots[x] = roots[y];
    x = y;
  }
  return x;
}

UnionFind.prototype.link = function(x, y) {
  var xr = this.find(x)
    , yr = this.find(y);
  if(xr === yr) {
    return;
  }
  var ranks = this.ranks
    , roots = this.roots
    , xd    = ranks[xr]
    , yd    = ranks[yr];
  if(xd < yd) {
    roots[xr] = yr;
  } else if(yd < xd) {
    roots[yr] = xr;
  } else {
    roots[yr] = xr;
    ++ranks[xr];
  }
}


},{}],22:[function(require,module,exports){
"use strict"; "use restrict";

var bits      = require("bit-twiddle")
  , UnionFind = require("union-find")

//Returns the dimension of a cell complex
function dimension(cells) {
  var d = 0
    , max = Math.max
  for(var i=0, il=cells.length; i<il; ++i) {
    d = max(d, cells[i].length)
  }
  return d-1
}
exports.dimension = dimension

//Counts the number of vertices in faces
function countVertices(cells) {
  var vc = -1
    , max = Math.max
  for(var i=0, il=cells.length; i<il; ++i) {
    var c = cells[i]
    for(var j=0, jl=c.length; j<jl; ++j) {
      vc = max(vc, c[j])
    }
  }
  return vc+1
}
exports.countVertices = countVertices

//Returns a deep copy of cells
function cloneCells(cells) {
  var ncells = new Array(cells.length)
  for(var i=0, il=cells.length; i<il; ++i) {
    ncells[i] = cells[i].slice(0)
  }
  return ncells
}
exports.cloneCells = cloneCells

//Ranks a pair of cells up to permutation
function compareCells(a, b) {
  var n = a.length
    , t = a.length - b.length
    , min = Math.min
  if(t) {
    return t
  }
  switch(n) {
    case 0:
      return 0;
    case 1:
      return a[0] - b[0];
    case 2:
      var d = a[0]+a[1]-b[0]-b[1]
      if(d) {
        return d
      }
      return min(a[0],a[1]) - min(b[0],b[1])
    case 3:
      var l1 = a[0]+a[1]
        , m1 = b[0]+b[1]
      d = l1+a[2] - (m1+b[2])
      if(d) {
        return d
      }
      var l0 = min(a[0], a[1])
        , m0 = min(b[0], b[1])
        , d  = min(l0, a[2]) - min(m0, b[2])
      if(d) {
        return d
      }
      return min(l0+a[2], l1) - min(m0+b[2], m1)
    
    //TODO: Maybe optimize n=4 as well?
    
    default:
      var as = a.slice(0)
      as.sort()
      var bs = b.slice(0)
      bs.sort()
      for(var i=0; i<n; ++i) {
        t = as[i] - bs[i]
        if(t) {
          return t
        }
      }
      return 0
  }
}
exports.compareCells = compareCells

function compareZipped(a, b) {
  return compareCells(a[0], b[0])
}

//Puts a cell complex into normal order for the purposes of findCell queries
function normalize(cells, attr) {
  if(attr) {
    var len = cells.length
    var zipped = new Array(len)
    for(var i=0; i<len; ++i) {
      zipped[i] = [cells[i], attr[i]]
    }
    zipped.sort(compareZipped)
    for(var i=0; i<len; ++i) {
      cells[i] = zipped[i][0]
      attr[i] = zipped[i][1]
    }
    return cells
  } else {
    cells.sort(compareCells)
    return cells
  }
}
exports.normalize = normalize

//Removes all duplicate cells in the complex
function unique(cells) {
  if(cells.length === 0) {
    return []
  }
  var ptr = 1
    , len = cells.length
  for(var i=1; i<len; ++i) {
    var a = cells[i]
    if(compareCells(a, cells[i-1])) {
      if(i === ptr) {
        ptr++
        continue
      }
      cells[ptr++] = a
    }
  }
  cells.length = ptr
  return cells
}
exports.unique = unique;

//Finds a cell in a normalized cell complex
function findCell(cells, c) {
  var lo = 0
    , hi = cells.length-1
    , r  = -1
  while (lo <= hi) {
    var mid = (lo + hi) >> 1
      , s   = compareCells(cells[mid], c)
    if(s <= 0) {
      if(s === 0) {
        r = mid
      }
      lo = mid + 1
    } else if(s > 0) {
      hi = mid - 1
    }
  }
  return r
}
exports.findCell = findCell;

//Builds an index for an n-cell.  This is more general than dual, but less efficient
function incidence(from_cells, to_cells) {
  var index = new Array(from_cells.length)
  for(var i=0, il=index.length; i<il; ++i) {
    index[i] = []
  }
  var b = []
  for(var i=0, n=to_cells.length; i<n; ++i) {
    var c = to_cells[i]
    var cl = c.length
    for(var k=1, kn=(1<<cl); k<kn; ++k) {
      b.length = bits.popCount(k)
      var l = 0
      for(var j=0; j<cl; ++j) {
        if(k & (1<<j)) {
          b[l++] = c[j]
        }
      }
      var idx=findCell(from_cells, b)
      if(idx < 0) {
        continue
      }
      while(true) {
        index[idx++].push(i)
        if(idx >= from_cells.length || compareCells(from_cells[idx], b) !== 0) {
          break
        }
      }
    }
  }
  return index
}
exports.incidence = incidence

//Computes the dual of the mesh.  This is basically an optimized version of buildIndex for the situation where from_cells is just the list of vertices
function dual(cells, vertex_count) {
  if(!vertex_count) {
    return incidence(unique(skeleton(cells, 0)), cells, 0)
  }
  var res = new Array(vertex_count)
  for(var i=0; i<vertex_count; ++i) {
    res[i] = []
  }
  for(var i=0, len=cells.length; i<len; ++i) {
    var c = cells[i]
    for(var j=0, cl=c.length; j<cl; ++j) {
      res[c[j]].push(i)
    }
  }
  return res
}
exports.dual = dual

//Enumerates all cells in the complex
function explode(cells) {
  var result = []
  for(var i=0, il=cells.length; i<il; ++i) {
    var c = cells[i]
      , cl = c.length|0
    for(var j=1, jl=(1<<cl); j<jl; ++j) {
      var b = []
      for(var k=0; k<cl; ++k) {
        if((j >>> k) & 1) {
          b.push(c[k])
        }
      }
      result.push(b)
    }
  }
  return normalize(result)
}
exports.explode = explode

//Enumerates all of the n-cells of a cell complex
function skeleton(cells, n) {
  if(n < 0) {
    return []
  }
  var result = []
    , k0     = (1<<(n+1))-1
  for(var i=0; i<cells.length; ++i) {
    var c = cells[i]
    for(var k=k0; k<(1<<c.length); k=bits.nextCombination(k)) {
      var b = new Array(n+1)
        , l = 0
      for(var j=0; j<c.length; ++j) {
        if(k & (1<<j)) {
          b[l++] = c[j]
        }
      }
      result.push(b)
    }
  }
  return normalize(result)
}
exports.skeleton = skeleton;

//Computes the boundary of all cells, does not remove duplicates
function boundary(cells) {
  var res = []
  for(var i=0,il=cells.length; i<il; ++i) {
    var c = cells[i]
    for(var j=0,cl=c.length; j<cl; ++j) {
      var b = new Array(c.length-1)
      for(var k=0, l=0; k<cl; ++k) {
        if(k !== j) {
          b[l++] = c[k]
        }
      }
      res.push(b)
    }
  }
  return normalize(res)
}
exports.boundary = boundary;

//Computes connected components for a dense cell complex
function connectedComponents_dense(cells, vertex_count) {
  var labels = new UnionFind(vertex_count)
  for(var i=0; i<cells.length; ++i) {
    var c = cells[i]
    for(var j=0; j<c.length; ++j) {
      for(var k=j+1; k<c.length; ++k) {
        labels.link(c[j], c[k])
      }
    }
  }
  var components = []
    , component_labels = labels.ranks
  for(var i=0; i<component_labels.length; ++i) {
    component_labels[i] = -1
  }
  for(var i=0; i<cells.length; ++i) {
    var l = labels.find(cells[i][0])
    if(component_labels[l] < 0) {
      component_labels[l] = components.length
      components.push([cells[i].slice(0)])
    } else {
      components[component_labels[l]].push(cells[i].slice(0))
    }
  }
  return components
}

//Computes connected components for a sparse graph
function connectedComponents_sparse(cells) {
  var vertices  = unique(normalize(skeleton(cells, 0)))
    , labels    = new UnionFind(vertices.length)
  for(var i=0; i<cells.length; ++i) {
    var c = cells[i]
    for(var j=0; j<c.length; ++j) {
      var vj = findCell(vertices, [c[j]])
      for(var k=j+1; k<c.length; ++k) {
        labels.link(vj, findCell(vertices, [c[k]]))
      }
    }
  }
  var components        = []
    , component_labels  = labels.ranks
  for(var i=0; i<component_labels.length; ++i) {
    component_labels[i] = -1
  }
  for(var i=0; i<cells.length; ++i) {
    var l = labels.find(findCell(vertices, [cells[i][0]]));
    if(component_labels[l] < 0) {
      component_labels[l] = components.length
      components.push([cells[i].slice(0)])
    } else {
      components[component_labels[l]].push(cells[i].slice(0))
    }
  }
  return components
}

//Computes connected components for a cell complex
function connectedComponents(cells, vertex_count) {
  if(vertex_count) {
    return connectedComponents_dense(cells, vertex_count)
  }
  return connectedComponents_sparse(cells)
}
exports.connectedComponents = connectedComponents

},{"bit-twiddle":20,"union-find":21}],23:[function(require,module,exports){
"use strict"

var createTriangulation = require("incremental-delaunay")
var sc = require("simplicial-complex")

module.exports = triangulate

function triangulate(points) {
  if(points.length === 0) {
    return []
  }
  var dimension = points[0].length
  var triangulation = createTriangulation(dimension)
  for(var i=0; i<points.length; ++i) {
    triangulation.insert(points[i])
  }
  var cells = []
outer_loop:
  for(var cur=triangulation.prev; cur!==triangulation; cur=cur.prev) {
    var v = cur.vertices
    for(var i=0; i<v.length; ++i) {
      if(v[i] <= dimension) {
        continue outer_loop
      }
      v[i] -= dimension + 1
    }
    cells.push(v)
  }
  return sc.normalize(cells)
}
},{"incremental-delaunay":1,"simplicial-complex":22}],24:[function(require,module,exports){
// set up the canvas and graphics
var canvasElement = require("./setupcanvas.js");
var width = canvasElement.width; var height = canvasElement.height;
var gc = canvasElement.getContext("2d");

var n = 50;
var robotRadius = 10;
var font = "12px Arial";
var dt = 30;
var distancePerTimeStep = 1000/5*dt/1000 * 0.5;
var path = new Array();
var showPaths = true;
var runSimulation = false;
var steps = 0;
var simulationFinished = false;
var algorithm = "in order";
var showDelaunayEdges = false;

// animation effect
setInterval(function() {updateSimulation()}, dt);
function updateSimulation() {
	// is the simulation finished
	simulationFinished = true;
	for (i = 0; i<n; i++) {
		if (robot[i].status == "awake") {
			simulationFinished = false;
			break;
		}
	}
	
	// buttons can also pause the simulation
	if (simulationFinished == true) {
		runSimulation = false;
	}
	
	// advance the simulation
	if (runSimulation == true) {
		updatePositionTake2();
		steps +=1;
	}
	
	// update the canvas / html
	stepButton.innerHTML  = "Step = " + steps;
	draw();
}


// draws on the canvas
function draw() {
	
	// clear the canvas - (color the entire canvas red)
	gc.fillStyle = "rgb(255, 110, 110)";
	gc.fillRect(0, 0, canvasElement.width, canvasElement.height);	

	// delaunay edges
	if (showDelaunayEdges == true) {
		gc.strokeStyle = "#ffffff";
		gc.lineWidth = "1";
		for (i = 0; i < edges.length; i++) {
			gc.beginPath();
			gc.moveTo(edges[i][0], edges[i][1]);
			gc.lineTo(edges[i][2], edges[i][3]);
			gc.stroke();
		}
	}
	
	// draw the paths
	if (showPaths == true) {
		gc.strokeStyle = "#ffff00";
		gc.lineWidth = "1";
		for (i = 0; i < n; i++) {
			if (robot[i].status == "awake" || robot[i].status == "stopped") {
				gc.beginPath(); 
				gc.moveTo(robot[i].x, robot[i].y);
				gc.lineTo(robot[i].lastTargetx, robot[i].lastTargety);
				gc.stroke();
			}
		}
		for (i = 0; i < path.length; i++) {
			gc.beginPath();
			gc.moveTo(path[i][0], path[i][1]);
			gc.lineTo(path[i][2], path[i][3]);
			gc.stroke();
		}
	}
	
	
	// draw the robots
	for (i = 0; i < n; i++) {
		if (robot[i].status == "awake" || robot[i].status =="stopped") {gc.fillStyle = "#00FF00";} else {gc.fillStyle = "5555FF";}
		gc.beginPath();
		gc.arc(robot[i].x, robot[i].y, robotRadius, 0, 2 * Math.PI, false);
		gc.fill();
	}
	gc.font = font;
	gc.textAlign="center";
	gc.textBaseline="middle"
	gc.fillStyle = "#000000";
	for (i = 0; i < n; i++) {
		gc.fillText(i, robot[i].x, robot[i].y);
	}
}

/*
function oldUpdatePositionFunctionThatHasBugsInIt() {	
	for (var i = 0; i < n; i++) {
		
		// claim a new robot if possible
		if (robot[i].status == "awake" && robot[i].claimed == -1) {
			if (schedule.length == 0) {
				robot[i].status = "stopped";
			}
			else {
				robot[i].claimed = schedule.shift();
				if (robot[i].claimed == -1) {
					robot[i].status = "stopped";
				}
				// update direction stored with robot
				if (robot[i].claimed != -1) {
					var dx = robot[robot[i].claimed].x - robot[i].x;
					var dy = robot[robot[i].claimed].y - robot[i].y;
					var length = Math.sqrt(dx*dx + dy*dy);
					var numSteps = length / distancePerTimeStep;
					robot[i].dx = dx / numSteps;
					robot[i].dy = dy / numSteps;
					robot[i].stepsToTarget = numSteps;
				}
			}
		}
		
		// move toward claimed robot
		if (robot[i].status == "awake") {
			if (robot[i].stepsToTarget  <= 1) {
				target = robot[i].claimed;
				robot[target].status = "awake";
				robot[i].x = robot[target].x;
				robot[i].y = robot[target].y;
				var p = [robot[i].lastTargetx, robot[i].lastTargety, robot[target].x, robot[target].y];
				path.push(p);
				robot[i].lastTargetx = robot[target].x;
				robot[i].lastTargety = robot[target].y;
				robot[i].claimed = -1;
			}
			else {
				robot[i].x += robot[i].dx;
				robot[i].y += robot[i].dy;
				robot[i].stepsToTarget -= 1;
			}
		}
	}
}
*/

function updatePositionTake2() {
	
	var remainingMovement = distancePerTimeStep;
	while (remainingMovement > 0) {
		// find distance to closest target
		var nextRobotToReachTarget = -1;
		var minDistance = 100000;
		for (var i = 0; i < n; i++) {
			if (robot[i].status == "awake" && robot[i].claimed == -1 && schedule.length == 0) {robot[i].status = "stopped";}
			if (robot[i].status == "awake" && robot[i].claimed == -1 && schedule.length > 0) {
				robot[i].claimed = schedule.shift();
				if (robot[i].claimed == -1) {
					robot[i].status = "stopped";
				}
				else {
					robot[i].dtt = Math.sqrt((robot[i].x-robot[robot[i].claimed].x)*(robot[i].x-robot[robot[i].claimed].x) + (robot[i].y-robot[robot[i].claimed].y)*(robot[i].y-robot[robot[i].claimed].y))
				}
			}
			if (robot[i].status == "awake") {
				if (robot[i].dtt < minDistance) {minDistance = robot[i].dtt; nextRobotToReachTarget = i;}
			}
		}
		// if no robot is close enough to awaken during this time step
		if (minDistance > remainingMovement) {
			moveRobots(remainingMovement);
			remainingMovement = 0;
		}
		// if a robot is close enough to awaken during this time step
		if (minDistance <= remainingMovement) {
			moveRobots(minDistance);
			remainingMovement -= minDistance;								// update remaining movement
			
			target = robot[nextRobotToReachTarget].claimed;
			robot[target].status = "awake";									// wake up target
			robot[nextRobotToReachTarget].claimed = -1;						// remove target from waker
			
			// for drawing the paths on the screen
			var p = [robot[nextRobotToReachTarget].lastTargetx, robot[nextRobotToReachTarget].lastTargety, robot[target].x, robot[target].y];
			path.push(p);
			robot[nextRobotToReachTarget].lastTargetx = robot[target].x;
			robot[nextRobotToReachTarget].lastTargety = robot[target].y;
		}
	}
}

function moveRobots(dist) {
	for (var i = 0; i < n; i++) {
		if (robot[i].status == "awake") {
			robot[i].x += (robot[robot[i].claimed].x - robot[i].x)*dist / robot[i].dtt;
			robot[i].y += (robot[robot[i].claimed].y - robot[i].y)*dist / robot[i].dtt;
			robot[i].dtt -=dist;
		}
	}
}

var robot = initializeRobots(n);
var edges = delaunayEdges();
function initializeRobots(n) {
	var r = new Array();
	for (i = 0; i < n; i++) {
		var a = Math.random()*(width-2*robotRadius) + robotRadius;
		var b = Math.random()*(height-2*robotRadius) + robotRadius;
		r[i] = {
			id: i,
			initialX: a,
			initialY: b,
			x: a,
			y: b,
			lastTargetx: a,
			lastTargety: b,
			status: "sleeping",
			claimed: -1,
			dx: 0,
			dy: 0,
			stepsToTarget: 0
		}
	}
	r[0].status = "awake";
	return r;
}


/*
var triangulate = require("delaunay-triangulate");  //https://npmjs.org/package/delaunay-triangulate thanks Mik

var points = [
[0,1],
[1,0],
[1,1],
[0,0],
[0.5,0.5],
[0.5,1.1]
];

var triangles = triangulate(points);

console.log(triangles);
*/

// returns the Delaunay Triangulation as a twin-edge data structure
// function delaunayTriangluation() {}


// returns the list of edges in the delaunay triangulation
function delaunayEdges() {
	var triangulate = require("delaunay-triangulate");  //https://npmjs.org/package/delaunay-triangulate thanks Mik
	
	points = new Array();
	for (i = 0; i<n; i++) {
		var p = [robot[i].x, robot[i].y]
		points.push(p);
	}
	var t = triangulate(points);
	var e = new Array();
	for (i = 0; i < t.length; i++) {
		var p0 = points[t[i][0]];
		var p1 = points[t[i][1]];
		var p2 = points[t[i][2]];
		e.push([p0[0], p0[1], p1[0], p1[1]]);
		e.push([p1[0], p1[1], p2[0], p2[1]]);
		e.push([p2[0], p2[1], p0[0], p0[1]]);
	}
	return e;
}


// below is the code that runs the  buttons
var playButton = document.querySelector("#playButton");
playButton.addEventListener("click", playButtonHandler);
function playButtonHandler(event) {
	if (runSimulation == false) {
		runSimulation = true;
		playButton.innerHTML = "Pause";
	}
	else {
		runSimulation = false;
		playButton.innerHTML = "Play";
	}
}

var resetButton = document.querySelector("#resetButton");
resetButton.addEventListener("click", resetButtonHandler);
function resetButtonHandler(event) {
	var r = new Array();
	for (var i = 0; i<n; i++) {
		var a = robot[i].initialX;
		var b = robot[i].initialY;
		r[i] = {
			initialX: a,
			initialY: b,
			x: a,
			y: b,
			lastTargetx: a,
			lastTargety: b,
			status: "sleeping",
			claimed: -1,
			dx: 0,
			dy: 0,
			stepsToTarget: 0,
			dtt: 0
		}
	}
	r[0].status = "awake"
	robot = r;
	schedule = generateSchedule();
	path = new Array();
	runSimulation = false;
	steps = 0;
	simulationFinished = false;
	playButton.innerHTML = "Play";
}


var showPathsButton = document.querySelector("#showPathsButton");
showPathsButton.addEventListener("click", showPathsButtonHandler);
function showPathsButtonHandler(event) {
	showPaths == true ? showPaths = false: showPaths=true;
}

var showDelaunay = document.querySelector("#showDelaunay");
showDelaunay.addEventListener("click", showDelaunayHandler);
function showDelaunayHandler(event) {
	showDelaunayEdges == true ? showDelaunayEdges = false: showDelaunayEdges=true;
}


var stepButton = document.querySelector("#stepButton");
stepButton.addEventListener("click", stepButtonHandler);
function stepButtonHandler(event) {
}

var number = document.querySelector("#number");
number.addEventListener("click", numberClickHandler);
function numberClickHandler(event) {
	number.value = "";
}
number.addEventListener("keypress", numberInputHandler);
function numberInputHandler(event) {
	if (event.charCode == 13) {
		n = parseInt(number.value);
		robot = initializeRobots(n);
		edges = delaunayEdges();
		schedule = new Array();
		schedule = generateSchedule();
		path = new Array();
		runSimulation = false;
		steps = 0;
		simulationFinished = false;
		number.value="" + n + " robots";
		playButton.innerHTML = "Play";
	}
}


var inOrderButton = document.querySelector("#inOrderButton");
var greedyClaimButton = document.querySelector("#greedyClaimButton");
var greedyDynamicButton = document.querySelector("#greedyDynamicButton");
var constantButton = document.querySelector("#constantButton");
//var bruteForceButton = document.querySelector("#bruteForceButton");

function grayButtons() {
	color = "#cccccc";
	inOrderButton.style.background=color;
	greedyClaimButton.style.background=color;
	greedyDynamicButton.style.background=color;
	constantButton.style.background=color;
	//bruteForceButton.style.background=color;
	resetButtonHandler();
	path = new Array();
}
grayButtons();
inOrderButton.style.background='#99ff99';

inOrderButton.addEventListener("click", inOrderButtonHandler);
function inOrderButtonHandler(event) {
	algorithm = "in order";
	grayButtons();
	inOrderButton.style.background='#99ff99';
}
/*
bruteForceButton.addEventListener("click", bruteForceButtonHandler);
function bruteForceButtonHandler(event) {
	algorithm = "brute force";
	grayButtons();
	bruteForceButton.style.background='#99ff99';
}
*/

greedyClaimButton.addEventListener("click", greedyClaimButtonHandler);
function greedyClaimButtonHandler(event) {
	algorithm = "greedy claim";
	grayButtons();
	greedyClaimButton.style.background='#99ff99';
}

greedyDynamicButton.addEventListener("click", greedyDynamicButtonHandler);
function greedyDynamicButtonHandler(event) {
	algorithm = "greedy dynamic";
	grayButtons();
	greedyDynamicButton.style.background='#99ff99';
}

constantButton.addEventListener("click", constantButtonHandler);
function constantButtonHandler(event) {
	algorithm = "constant";
	grayButtons();
	constantButton.style.background='#99ff99';
}

var schedule = new Array();
schedule = generateSchedule();

function generateSchedule() {
	s = new Array();
	if (algorithm == "in order") {
		s = inOrderSchedule();
	}
	if (algorithm == "greedy claim") {
		s = greedyClaimScheduleTake2();
	}
	if (algorithm == "greedy dynamic") {
		s = greedyDynamicSchedule();
	}
	if (algorithm == "constant") {
		s = constantSchedule();
	}
	/*if (algorithm == "brute force") {
		s = bruteForceSchedule();
	}*/
	return s;
}

function inOrderSchedule() {
	s = new Array();
	for (i = 1; i<n; i++) {
		s.push(i);
	}
	return s;
}

function greedyClaimScheduleTake2() {
	var s = new Array();
	var time = 0;
	var sleepingCount = n-1;

	// make a copy of the robots
	r = new Array();
	for (i = 0; i<n; i++) {
		r.push({
			x: robot[i].x,
			y: robot[i].y,
			status: robot[i].status,
			target: -1,
			arrivalTime: 0
		})
	}
	
	while (sleepingCount > 0) {
		var minTime = 10000;
		var nextRobot = -1;
		
		// determine which robot will reach its target next
		for (var i = 0; i < n; i++) {
			if (r[i].status == "awake") {

				// if the robot doesn't have a target
				if (r[i].target == -1) {

					//claim a new target and calculate arrival time
					var closestSleepingRobot = -1;
					var minDist = 110000000;
					for (var j = 0; j<n; j++) {
						if (r[j].status == "sleeping") {
							var distance = Math.sqrt((r[i].x-r[j].x)*(r[i].x-r[j].x) + (r[i].y-r[j].y)*(r[i].y-r[j].y));
							if (distance < minDist) {
								minDist = distance;
								closestSleepingRobot = j;
							}
						}
					}
					if (s.length < n-1) {
						s.push(closestSleepingRobot);
						r[i].target = closestSleepingRobot;
						r[i].arrivalTime = time + minDist;
						r[closestSleepingRobot].status = "claimed";
						sleepingCount--;
					}
				}
				if (r[i].arrivalTime < minTime) {
					minTime = r[i].arrivalTime; 
					nextRobot = i;
				}
			}
		}
		
		// now we know which robot will arrive at its target next and when it will get there
		time = minTime;
		var target = r[nextRobot].target;
		r[nextRobot].x = r[target].x;
		r[nextRobot].y = r[target].y;
		r[nextRobot].target = -1;
		r[target].status = "awake";
	}
	return s;
}


function greedyClaimSchedule() {
	s = new Array();
	
	// make a copy of the robots
	r = new Array();
	for (i = 0; i<n; i++) {
		r.push({
			x: robot[i].x,
			y: robot[i].y,
			status: robot[i].status,
			claim: -1,
			distanceTraveledByPreviousRobot: 0,
			distance: 100000000000000
		})
	}
	
	// fill in the schedule
	for (var x = 1; x < n; x++) {
		//update claims 
		for (var i = 0; i < n; i++) {
			if (r[i].status == "awake" && r[i].claim == -1) {
				for (var j = 0; j < n; j++) {
					if (r[j].status == "sleeping") {
						var d = Math.sqrt((r[i].x-r[j].x) * (r[i].x-r[j].x) + (r[i].y-r[j].y)*(r[i].y-r[j].y)) + r[i].distanceTraveledByPreviousRobot;
						if (d < r[i].distance) {
							r[i].distance = d;
							r[i].claim = j;
							r[j].distanceTraveledByPreviousRobot = d+r[i].distanceTraveledByPreviousRobot;
						}
					}
				}
				if (r[i].claim == -1) {return s;}
				r[r[i].claim].status = "claimed";
				s.push(r[i].claim);

			}
		}
				
		//find next robot to reach its target
		var d = 100000000000000;
		var t = 0;
		var rNext = -1;
		for (var i = 0; i<n; i++) {
			if (r[i].distance < d) {d = r[i].distance; rNext=i; t = i;}
		}
		r[t].distanceTraveledByPreviousRobot = r[t].distanceTraveledByPreviousRobot+d;
		r[rNext].distance = 100000000000000;
		r[r[rNext].claim].status = "awake"
		
		r[rNext].x = r[r[rNext].claim].x;
		r[rNext].y = r[r[rNext].claim].y;
		
		r[rNext].claim = -1;
	}
	return s;
}


function greedyDynamicSchedule() {
	// make a copy of the robots
	r = new Array();
	for (i = 0; i<n; i++) {
		r.push({
			x: robot[i].x,
			y: robot[i].y,
			status: robot[i].status,
			distanceAcquiredSinceLastJump: 0,
			remainingDistanceToClosestTarget: 10000,
			closest: -1,
			})
	}
	
	//initialize the target list
	var targetList = new Array();
	targetList.push([0, -1]);
	
	
	//fill in the target list
	for (var x = 1; x < n; x++) {

		//calculate distance to nearest robot for all awake robots
		for (i = 0; i<n; i++) {
			if (r[i].status == "awake") {
				r[i].closest = -1;
				r[i].remainingDistanceToClosestTarget = 10000;
				for (j = 0; j < n; j++) {
					if (r[j].status == "sleeping") {
						var d = Math.sqrt((r[i].x-r[j].x) * (r[i].x-r[j].x) + (r[i].y-r[j].y)*(r[i].y-r[j].y)) - r[i].distanceAcquiredSinceLastJump;
						if (d < r[i].remainingDistanceToClosestTarget) {
							r[i].remainingDistanceToClosestTarget = d;
							r[i].closest = j;
						}
					}
				}
			}
		}
		
		// which robot will reach it's target first
		var nextRobotToReachTarget = -1;
		var d = 100000;
		for (var i = 0; i<n; i++) {
			if (r[i].status == "awake" && r[i].remainingDistanceToClosestTarget < d) {
				d = r[i].remainingDistanceToClosestTarget; 
				nextRobotToReachTarget = i;
			}
		}
		if (d == 100000) {break;}
		
		// update acquired distance for all awake robots
		for (var i = 0; i<n; i++) {
			if (r[i].status == "awake") {
				r[i].distanceAcquiredSinceLastJump += d;
			}
		}
		
		//reset robot that made the jump
		r[nextRobotToReachTarget].distanceAcquiredSinceLastJump = 0;
		r[nextRobotToReachTarget].x = r[r[nextRobotToReachTarget].closest].x;
		r[nextRobotToReachTarget].y = r[r[nextRobotToReachTarget].closest].y;
		
		//add the two robots to the target list in numerical order
		if (r[nextRobotToReachTarget].closest < nextRobotToReachTarget) {
			targetList.push([r[nextRobotToReachTarget].closest, -1]);
			targetList.push([nextRobotToReachTarget, -1]);
		}
		else {
			targetList.push([nextRobotToReachTarget, -1]);
			targetList.push([r[nextRobotToReachTarget].closest, -1]);
		}
		
		// update newly awakened robot
		r[r[nextRobotToReachTarget].closest].status = "awake";
		
		//update the target list
		var updated = false;
		for (var i = 0; i < targetList.length; i++) {
			if (targetList[i][0] == nextRobotToReachTarget && targetList[i][1] == -1 && updated == false) {
				targetList[i][1] = r[nextRobotToReachTarget].closest;
				updated = true;
			}
		}
	}
	
	s = new Array();
	for (var i = 0; i<targetList.length; i++) {
		s.push(targetList[i][1]);
	}
	return s;
}



/*

I never did get this to work.  I'm taking it out of the final project.  It turns out that calculating the optimal
schedule is actually harder than O(n!) because at every step a robot can wake up one of the remaining n robots or 
it can stop - leading to an O((n+1)!) algorithm

function bruteForceSchedule() {
	if (n > 10) {
		console.log("computationally infeasible");
		return constantSchedule();
	}
	else {
		var s = new Array();
		var perm = new Array(); for (var i = 0; i<n; i++) {perm.push(i);} for (var i = 0; i<n/2; i++) {perm.push(-1);}
		var u = new Array();
		var f = factorial(n);
		var t = 10000000;
		
		var pGenerator = require("permutation-rank");  //https://npmjs.org/package/permutation-rank thanks again Mik.

		for (var r = 0; r < f; r++) {	// r is the rank of the permutation
		u = pGenerator.unrank(perm.length, r);
		console.log(r, u);
		}
	}
}

function factorial(num) {	//http://stackoverflow.com/questions/3959211/fast-factorial-function-in-javascript
    var r=1;
    for (var i = 2; i <= num; i++)
        r = r * i;
    return r;
}
*/

function constantSchedule() {
	var numSectors = 8;
	var dx;
	var dy;
	var k;
	var d;
	
	var s = new Array();
	var r = new Array();
	var c = new Array(n);
	

	
	for (var i = 0; i < n; i++) {
		c[i] = new Array(numSectors);
		for (var k = 0; k < numSectors; k++) {
			c[i][k] = [-1,1234567];
		}
	}
	
	// make a copy of the robots
	for (var i = 0; i < n; i++) {
		r.push(new Object({x: robot[i].x, y: robot[i].y, status: robot[i].status, d: 0}));
	}
	
	// c matrix  holds data about closest robot in each of 8 sectors
	for (var i = 0; i < n; i++) {
		for (var j = 0; j < n; j++) {
			if (i != j) {
				dx = r[j].x - r[i].x;
				dy = r[j].y - r[i].y;
				k = 0;
				if (dx < 0) {k +=4;}
				if (dy < 0) {k +=2;}
				if (Math.abs(dx) < Math.abs(dy)) {k++;}
				d = Math.sqrt(dx*dx+dy*dy);
				if (c[i][k][0] == -1 || d < c[i][k][1]) {
					c[i][k][0] = j;
					c[i][k][1] = d;
				}
			}
		}
	}
	
	var targetList = new Array();
	targetList.push([0,-1]);
	
	for (var x = 1; x < n; x++) {
		
		// which awake robot will reach its target first and how far away is that target
		var nextRobot = -1;
		var target = -1;
		var minDist = 1234567;
		
						
		for (var i = 0; i < n; i++) {
			if (r[i].status  == "awake" ) {
				console.log( i + " is awake");
				for (var k = 0; k < numSectors; k++) {	// update status of robots in c matrix
					var v = c[i][k][0];
					if (v > -1) {
						if (r[v].status == "awake" || r[v].status == "stopped") {
							c[i][k][0] = -1;	// no longer a valid target
							c[i][k][1] = 1234567;	// so sorting puts these at the end
						}					
					}
				}
				c[i].sort(function(a,b) {return a[1]-b[1]});
				var t = c[i][0][0];	// next target id
				if (t == -1) {	// no valid target
					r[i].status = "stopped";
				}
				if (r[i].status == "awake") {
					dx = r[t].x - r[i].x;
					dy = r[t].y - r[i].y;
					d = Math.sqrt(dx*dx+dy*dy) - r[i].d;
					if (d < minDist) {
						nextRobot = i;
						target = t;
						minDist = d;
					}
				}
			}
		}
		
		// now we know which robot will awaken which target and how far it needs to move to do that
		// move all awake robots that far
		for (var i = 0; i < n; i++) {
			if (r[i].status == "awake") {
				r[i].d += minDist;
			}
		}
		
		// update status of waker and target
		r[nextRobot].d = 0;
		r[nextRobot].x = r[target].x;
		r[nextRobot].y = r[target].y;
		r[target].status = "awake";
		
		// update target list
		targetList.push([Math.min(nextRobot, target),-1]);
		targetList.push([Math.max(nextRobot, target),-1]);
		var updated = false;
		for (var i = 0; i < targetList.length; i++) {
			if (targetList[i][0] == nextRobot && targetList[i][1] == -1 && updated == false) {
				targetList[i][1] = target;
				updated = true;
			}
		}
		
	}
	

	for (var i = 0; i < targetList.length; i++) {
		s.push(targetList[i][1]);
	}

	return s;
}



















},{"./setupcanvas.js":25,"delaunay-triangulate":23}],25:[function(require,module,exports){
// viewport dimensions
var w = window;
    d = document;
    e = d.documentElement;
    g = d.getElementsByTagName('body')[0];
    x = w.innerWidth || e.clientWidth || g.clientWidth;
    y = w.innerHeight|| e.clientHeight|| g.clientHeight;

var canvasElement = document.querySelector("#canvas");

canvasElement.width = Math.min(Math.min(x,y)-50, 700);
canvasElement.height = Math.min(Math.min(x,y)-50, 700);

module.exports = canvasElement;
},{}]},{},[24])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXG5vZGVfbW9kdWxlc1xcZGVsYXVuYXktdHJpYW5ndWxhdGVcXG5vZGVfbW9kdWxlc1xcaW5jcmVtZW50YWwtZGVsYXVuYXlcXGRlbGF1bmF5LmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXGluY3JlbWVudGFsLWRlbGF1bmF5XFxub2RlX21vZHVsZXNcXGRlY2tcXGluZGV4LmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXGluY3JlbWVudGFsLWRlbGF1bmF5XFxub2RlX21vZHVsZXNcXGlvdGEtYXJyYXlcXGlvdGEuanMiLCJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXG5vZGVfbW9kdWxlc1xcZGVsYXVuYXktdHJpYW5ndWxhdGVcXG5vZGVfbW9kdWxlc1xcaW5jcmVtZW50YWwtZGVsYXVuYXlcXG5vZGVfbW9kdWxlc1xccm9idXN0LWluLXNwaGVyZVxcaW4tc3BoZXJlLmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXGluY3JlbWVudGFsLWRlbGF1bmF5XFxub2RlX21vZHVsZXNcXHJvYnVzdC1pbi1zcGhlcmVcXG5vZGVfbW9kdWxlc1xccm9idXN0LXNjYWxlXFxub2RlX21vZHVsZXNcXHR3by1zdW1cXHR3by1zdW0uanMiLCJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXG5vZGVfbW9kdWxlc1xcZGVsYXVuYXktdHJpYW5ndWxhdGVcXG5vZGVfbW9kdWxlc1xcaW5jcmVtZW50YWwtZGVsYXVuYXlcXG5vZGVfbW9kdWxlc1xccm9idXN0LWluLXNwaGVyZVxcbm9kZV9tb2R1bGVzXFxyb2J1c3Qtc2NhbGVcXHJvYnVzdC1zY2FsZS5qcyIsIkM6XFxVc2Vyc1xcTWlrZVxcRG9jdW1lbnRzXFxHaXRIdWJcXGZ0cFxcbm9kZV9tb2R1bGVzXFxkZWxhdW5heS10cmlhbmd1bGF0ZVxcbm9kZV9tb2R1bGVzXFxpbmNyZW1lbnRhbC1kZWxhdW5heVxcbm9kZV9tb2R1bGVzXFxyb2J1c3QtaW4tc3BoZXJlXFxub2RlX21vZHVsZXNcXHJvYnVzdC1zdWJ0cmFjdFxccm9idXN0LWRpZmYuanMiLCJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXG5vZGVfbW9kdWxlc1xcZGVsYXVuYXktdHJpYW5ndWxhdGVcXG5vZGVfbW9kdWxlc1xcaW5jcmVtZW50YWwtZGVsYXVuYXlcXG5vZGVfbW9kdWxlc1xccm9idXN0LWluLXNwaGVyZVxcbm9kZV9tb2R1bGVzXFxyb2J1c3Qtc3VtXFxub2RlX21vZHVsZXNcXGJpbmFyeS1tZXJnZVxcbWVyZ2UyLmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXGluY3JlbWVudGFsLWRlbGF1bmF5XFxub2RlX21vZHVsZXNcXHJvYnVzdC1pbi1zcGhlcmVcXG5vZGVfbW9kdWxlc1xccm9idXN0LXN1bVxcbm9kZV9tb2R1bGVzXFx0d28tc3VtXFx0d28tc3VtLmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXGluY3JlbWVudGFsLWRlbGF1bmF5XFxub2RlX21vZHVsZXNcXHJvYnVzdC1pbi1zcGhlcmVcXG5vZGVfbW9kdWxlc1xccm9idXN0LXN1bVxccm9idXN0LXN1bS5qcyIsIkM6XFxVc2Vyc1xcTWlrZVxcRG9jdW1lbnRzXFxHaXRIdWJcXGZ0cFxcbm9kZV9tb2R1bGVzXFxkZWxhdW5heS10cmlhbmd1bGF0ZVxcbm9kZV9tb2R1bGVzXFxpbmNyZW1lbnRhbC1kZWxhdW5heVxcbm9kZV9tb2R1bGVzXFxyb2J1c3QtaW4tc3BoZXJlXFxub2RlX21vZHVsZXNcXHR3by1wcm9kdWN0XFx0d28tcHJvZHVjdC5qcyIsIkM6XFxVc2Vyc1xcTWlrZVxcRG9jdW1lbnRzXFxHaXRIdWJcXGZ0cFxcbm9kZV9tb2R1bGVzXFxkZWxhdW5heS10cmlhbmd1bGF0ZVxcbm9kZV9tb2R1bGVzXFxpbmNyZW1lbnRhbC1kZWxhdW5heVxcbm9kZV9tb2R1bGVzXFxyb2J1c3Qtb3JpZW50YXRpb25cXG5vZGVfbW9kdWxlc1xccm9idXN0LXNjYWxlXFxub2RlX21vZHVsZXNcXHR3by1zdW1cXHR3by1zdW0uanMiLCJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXG5vZGVfbW9kdWxlc1xcZGVsYXVuYXktdHJpYW5ndWxhdGVcXG5vZGVfbW9kdWxlc1xcaW5jcmVtZW50YWwtZGVsYXVuYXlcXG5vZGVfbW9kdWxlc1xccm9idXN0LW9yaWVudGF0aW9uXFxub2RlX21vZHVsZXNcXHJvYnVzdC1zY2FsZVxccm9idXN0LXNjYWxlLmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXGluY3JlbWVudGFsLWRlbGF1bmF5XFxub2RlX21vZHVsZXNcXHJvYnVzdC1vcmllbnRhdGlvblxcbm9kZV9tb2R1bGVzXFxyb2J1c3Qtc3VtXFxub2RlX21vZHVsZXNcXGJpbmFyeS1tZXJnZVxcbWVyZ2UyLmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXGluY3JlbWVudGFsLWRlbGF1bmF5XFxub2RlX21vZHVsZXNcXHJvYnVzdC1vcmllbnRhdGlvblxcbm9kZV9tb2R1bGVzXFxyb2J1c3Qtc3VtXFxub2RlX21vZHVsZXNcXHR3by1zdW1cXHR3by1zdW0uanMiLCJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXG5vZGVfbW9kdWxlc1xcZGVsYXVuYXktdHJpYW5ndWxhdGVcXG5vZGVfbW9kdWxlc1xcaW5jcmVtZW50YWwtZGVsYXVuYXlcXG5vZGVfbW9kdWxlc1xccm9idXN0LW9yaWVudGF0aW9uXFxub2RlX21vZHVsZXNcXHJvYnVzdC1zdW1cXHJvYnVzdC1zdW0uanMiLCJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXG5vZGVfbW9kdWxlc1xcZGVsYXVuYXktdHJpYW5ndWxhdGVcXG5vZGVfbW9kdWxlc1xcaW5jcmVtZW50YWwtZGVsYXVuYXlcXG5vZGVfbW9kdWxlc1xccm9idXN0LW9yaWVudGF0aW9uXFxub2RlX21vZHVsZXNcXHR3by1wcm9kdWN0XFx0d28tcHJvZHVjdC5qcyIsIkM6XFxVc2Vyc1xcTWlrZVxcRG9jdW1lbnRzXFxHaXRIdWJcXGZ0cFxcbm9kZV9tb2R1bGVzXFxkZWxhdW5heS10cmlhbmd1bGF0ZVxcbm9kZV9tb2R1bGVzXFxpbmNyZW1lbnRhbC1kZWxhdW5heVxcbm9kZV9tb2R1bGVzXFxyb2J1c3Qtb3JpZW50YXRpb25cXG9yaWVudGF0aW9uLmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXGluY3JlbWVudGFsLWRlbGF1bmF5XFxub2RlX21vZHVsZXNcXHJvYnVzdC1wb2ludC1pbi1zaW1wbGV4XFxycGlzLmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxub2RlX21vZHVsZXNcXGRlbGF1bmF5LXRyaWFuZ3VsYXRlXFxub2RlX21vZHVsZXNcXHNpbXBsaWNpYWwtY29tcGxleFxcbm9kZV9tb2R1bGVzXFxiaXQtdHdpZGRsZVxcdHdpZGRsZS5qcyIsIkM6XFxVc2Vyc1xcTWlrZVxcRG9jdW1lbnRzXFxHaXRIdWJcXGZ0cFxcbm9kZV9tb2R1bGVzXFxkZWxhdW5heS10cmlhbmd1bGF0ZVxcbm9kZV9tb2R1bGVzXFxzaW1wbGljaWFsLWNvbXBsZXhcXG5vZGVfbW9kdWxlc1xcdW5pb24tZmluZFxcaW5kZXguanMiLCJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXG5vZGVfbW9kdWxlc1xcZGVsYXVuYXktdHJpYW5ndWxhdGVcXG5vZGVfbW9kdWxlc1xcc2ltcGxpY2lhbC1jb21wbGV4XFx0b3BvbG9neS5qcyIsIkM6XFxVc2Vyc1xcTWlrZVxcRG9jdW1lbnRzXFxHaXRIdWJcXGZ0cFxcbm9kZV9tb2R1bGVzXFxkZWxhdW5heS10cmlhbmd1bGF0ZVxcdHJpYW5ndWxhdGUuanMiLCJDOlxcVXNlcnNcXE1pa2VcXERvY3VtZW50c1xcR2l0SHViXFxmdHBcXHJvYm90c2NyaXB0LmpzIiwiQzpcXFVzZXJzXFxNaWtlXFxEb2N1bWVudHNcXEdpdEh1YlxcZnRwXFxzZXR1cGNhbnZhcy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBOztBQ0FBOztBQ0FBOztBQ0FBOztBQ0FBOztBQ0FBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNTBCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCJcblxudmFyIGlvdGEgPSByZXF1aXJlKFwiaW90YS1hcnJheVwiKVxudmFyIGRlY2sgPSByZXF1aXJlKFwiZGVja1wiKVxudmFyIG9yaWVudGF0aW9uID0gcmVxdWlyZShcInJvYnVzdC1vcmllbnRhdGlvblwiKVxudmFyIHBvaW50SW5TaW1wbGV4ID0gcmVxdWlyZShcInJvYnVzdC1wb2ludC1pbi1zaW1wbGV4XCIpXG52YXIgaW5TcGhlcmUgPSByZXF1aXJlKFwicm9idXN0LWluLXNwaGVyZVwiKVxudmFyIHNjID0gcmVxdWlyZShcInNpbXBsaWNpYWwtY29tcGxleFwiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZURlbGF1bmF5VHJpYW5ndWxhdGlvblxuXG5mdW5jdGlvbiBTaW1wbGV4KHRyaWFuZ3VsYXRpb24sIHZlcnRpY2VzLCBjaGlsZHJlbiwgbmV4dCwgcHJldikge1xuICB0aGlzLnRyaWFuZ3VsYXRpb24gPSB0cmlhbmd1bGF0aW9uXG4gIHRoaXMudmVydGljZXMgPSB2ZXJ0aWNlc1xuICB0aGlzLmNoaWxkcmVuID0gY2hpbGRyZW5cbiAgdGhpcy5uZXh0ID0gbmV4dFxuICB0aGlzLnByZXYgPSBwcmV2XG59XG5cbnZhciBwcm90byA9IFNpbXBsZXgucHJvdG90eXBlXG5cbnByb3RvLmluc2VydCA9IGZ1bmN0aW9uKHApIHtcbiAgaWYodGhpcy5jaGlsZHJlbikge1xuICAgIGZvcih2YXIgaT0wOyBpPHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmKHRoaXMuY2hpbGRyZW5baV0uY29udGFpbnModGhpcy50cmlhbmd1bGF0aW9uLnBvaW50c1twXSkpIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlbltpXS5pbnNlcnQocClcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy9VbmxpbmsgZnJvbSBsaXN0XG4gICAgdGhpcy5wcmV2Lm5leHQgPSB0aGlzLm5leHRcbiAgICB0aGlzLm5leHQucHJldiA9IHRoaXMucHJldlxuICAgIHRoaXMubmV4dCA9IHRoaXMucHJldiA9IG51bGxcbiAgICAvL0FkZCBjaGlsZFxuICAgIHRoaXMuY2hpbGRyZW4gPSBbXVxuICAgIGZvcih2YXIgaT10aGlzLnZlcnRpY2VzLmxlbmd0aC0xOyBpPj0wOyAtLWkpIHtcbiAgICAgIC8vUmVtb3ZlIGZyb20gZHVhbFxuICAgICAgdmFyIHYgPSB0aGlzLnZlcnRpY2VzW2ldXG4gICAgICB2YXIgZCA9IHRoaXMudHJpYW5ndWxhdGlvbi5fZHVhbFt2XVxuICAgICAgZm9yKHZhciBqPWQubGVuZ3RoLTE7IGo+PTA7IC0taikge1xuICAgICAgICBpZihkW2pdID09PSB0aGlzKSB7XG4gICAgICAgICAgZFtqXSA9IGRbZC5sZW5ndGgtMV1cbiAgICAgICAgICBkLnBvcCgpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy9BZGQgY2hpbGRcbiAgICAgIHZhciBudiA9IHRoaXMudmVydGljZXMuc2xpY2UoKVxuICAgICAgbnZbaV0gPSBwXG4gICAgICB2YXIgY2hpbGQgPSBuZXcgU2ltcGxleCh0aGlzLnRyaWFuZ3VsYXRpb24sIG52LCBudWxsLCB0aGlzLnRyaWFuZ3VsYXRpb24ubmV4dCwgdGhpcy50cmlhbmd1bGF0aW9uKVxuICAgICAgaWYoIWNoaWxkLmRlZ2VuZXJhdGUoKSkge1xuICAgICAgICB0aGlzLmNoaWxkcmVuLnB1c2goY2hpbGQpXG4gICAgICAgIHRoaXMudHJpYW5ndWxhdGlvbi5uZXh0LnByZXYgPSBjaGlsZFxuICAgICAgICB0aGlzLnRyaWFuZ3VsYXRpb24ubmV4dCA9IGNoaWxkXG4gICAgICAgIGZvcih2YXIgaj0wOyBqPG52Lmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgdGhpcy50cmlhbmd1bGF0aW9uLl9kdWFsW252W2pdXS5wdXNoKGNoaWxkKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbnByb3RvLmNvbnRhaW5zID0gZnVuY3Rpb24ocCkge1xuICB2YXIgcG9pbnRMaXN0ID0gbmV3IEFycmF5KHRoaXMudmVydGljZXMubGVuZ3RoKVxuICBmb3IodmFyIGk9MDsgaTx0aGlzLnZlcnRpY2VzLmxlbmd0aDsgKytpKSB7XG4gICAgcG9pbnRMaXN0W2ldID0gdGhpcy50cmlhbmd1bGF0aW9uLnBvaW50c1t0aGlzLnZlcnRpY2VzW2ldXVxuICB9XG4gIHJldHVybiBwb2ludEluU2ltcGxleChwb2ludExpc3QsIHApID49IDBcbn1cblxucHJvdG8uZGVnZW5lcmF0ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcG9pbnRMaXN0ID0gbmV3IEFycmF5KHRoaXMudmVydGljZXMubGVuZ3RoKVxuICBmb3IodmFyIGk9MDsgaTx0aGlzLnZlcnRpY2VzLmxlbmd0aDsgKytpKSB7XG4gICAgcG9pbnRMaXN0W2ldID0gdGhpcy50cmlhbmd1bGF0aW9uLnBvaW50c1t0aGlzLnZlcnRpY2VzW2ldXVxuICB9XG4gIHJldHVybiBvcmllbnRhdGlvbihwb2ludExpc3QpID09PSAwXG59XG5cbmZ1bmN0aW9uIERlbGF1bmF5VHJpYW5ndWxhdGlvbihwb2ludHMsIGR1YWwsIHJvb3QpIHtcbiAgdGhpcy5wb2ludHMgPSBwb2ludHNcbiAgdGhpcy5fZHVhbCA9IGR1YWxcbiAgdGhpcy5fcm9vdCA9IHJvb3RcbiAgdGhpcy5uZXh0ID0gdGhpc1xuICB0aGlzLnByZXYgPSB0aGlzXG59XG5cbnZhciBkcHJvdG8gPSBEZWxhdW5heVRyaWFuZ3VsYXRpb24ucHJvdG90eXBlXG5cblxuZHByb3RvLmR1YWwgPSBmdW5jdGlvbih2KSB7XG4gIHZhciBkID0gdGhpcy5fZHVhbFt2XVxuICB2YXIgciA9IFtdXG4gIGZvcih2YXIgaT0wOyBpPGQubGVuZ3RoOyArK2kpIHtcbiAgICByLnB1c2goZFtpXS52ZXJ0aWNlcylcbiAgfVxuICByZXR1cm4gclxufVxuXG5mdW5jdGlvbiByZW1vdmVGcm9tRHVhbCh0cmlhbmd1bGF0aW9uLCBzaW1wbGV4KSB7XG4gIGZvcih2YXIgaT0wOyBpPHNpbXBsZXgudmVydGljZXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgZCA9IHRyaWFuZ3VsYXRpb24uX2R1YWxbc2ltcGxleC52ZXJ0aWNlc1tpXV1cbiAgICBmb3IodmFyIGo9MDsgajxkLmxlbmd0aDsgKytqKSB7XG4gICAgICBpZihkW2pdID09PSBzaW1wbGV4KSB7XG4gICAgICAgIGRbal0gPSBkW2QubGVuZ3RoLTFdXG4gICAgICAgIGQucG9wKClcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZHByb3RvLmluc2VydCA9IGZ1bmN0aW9uKHApIHtcbiAgdmFyIHYgPSB0aGlzLnBvaW50cy5sZW5ndGhcbiAgdGhpcy5wb2ludHMucHVzaChwKVxuICB0aGlzLl9kdWFsLnB1c2goW10pXG4gIHRoaXMuX3Jvb3QuaW5zZXJ0KHYpXG4gIC8vRml4IHVwIGRlbGF1bmF5IGNvbmRpdGlvblxuICB2YXIgdG9fdmlzaXQgPSB0aGlzLl9kdWFsW3ZdLnNsaWNlKClcbiAgd2hpbGUodG9fdmlzaXQubGVuZ3RoID4gMCkge1xuICAgIHZhciBjID0gdG9fdmlzaXRbdG9fdmlzaXQubGVuZ3RoLTFdXG4gICAgdG9fdmlzaXQucG9wKClcbiAgICBpZihjLmNoaWxkcmVuKSB7XG4gICAgICBjb250aW51ZVxuICAgIH1cbiAgICAvL0dldCBvcHBvc2l0ZSBzaW1wbGV4XG4gICAgdmFyIHBvaW50cyA9IG5ldyBBcnJheShjLnZlcnRpY2VzLmxlbmd0aCsxKVxuICAgIHZhciB2X3N1bSA9IDBcbiAgICBmb3IodmFyIGk9MDsgaTxjLnZlcnRpY2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwb2ludHNbaV0gPSB0aGlzLnBvaW50c1tjLnZlcnRpY2VzW2ldXVxuICAgICAgdl9zdW0gXj0gYy52ZXJ0aWNlc1tpXVxuICAgIH1cbiAgICAvL1dhbGsgb3ZlciBzaW1wbGV4IHZlcnRpY2VzXG5kb19mbGlwOlxuICAgIGZvcih2YXIgaT0wOyBpPGMudmVydGljZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIC8vRmluZCBvcHBvc2l0ZSBzaW1wbGV4IHRvIHZlcnRleCBpXG4gICAgICBpZihjLnZlcnRpY2VzW2ldICE9PSB2KSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICB2YXIgZCA9IHRoaXMuX2R1YWxbYy52ZXJ0aWNlc1soaSsxKSVjLnZlcnRpY2VzLmxlbmd0aF1dXG4gICAgICB2YXIgb3Bwb3NpdGVcbiAgICAgIHZhciBvcHBvc2l0ZV9pbmRleFxuc2VhcmNoX29wcG9zaXRlOlxuICAgICAgZm9yKHZhciBqPTA7IGo8ZC5sZW5ndGg7ICsraikge1xuICAgICAgICBvcHBvc2l0ZSA9IGRbal1cbiAgICAgICAgaWYob3Bwb3NpdGUgPT09IGMpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIG9wcG9zaXRlX2luZGV4ID0gdl9zdW0gXiB2XG4gICAgICAgIGZvcih2YXIgaz0wOyBrPG9wcG9zaXRlLnZlcnRpY2VzLmxlbmd0aDsgKytrKSB7XG4gICAgICAgICAgb3Bwb3NpdGVfaW5kZXggXj0gb3Bwb3NpdGUudmVydGljZXNba11cbiAgICAgICAgICBpZihjLnZlcnRpY2VzW2tdICE9PSB2ICYmIG9wcG9zaXRlLnZlcnRpY2VzLmluZGV4T2YoYy52ZXJ0aWNlc1trXSkgPCAwKSB7XG4gICAgICAgICAgICBjb250aW51ZSBzZWFyY2hfb3Bwb3NpdGVcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy9DaGVjayBpZiBsZWdhbFxuICAgICAgICBwb2ludHNbYy52ZXJ0aWNlcy5sZW5ndGhdID0gdGhpcy5wb2ludHNbb3Bwb3NpdGVfaW5kZXhdXG4gICAgICAgIHZhciBzID0gaW5TcGhlcmUocG9pbnRzKVxuICAgICAgICBpZihpblNwaGVyZShwb2ludHMpID4gMCkge1xuICAgICAgICAgIC8vVW5saW5rIGNlbGxzXG4gICAgICAgICAgcmVtb3ZlRnJvbUR1YWwodGhpcywgYylcbiAgICAgICAgICBjLmNoaWxkcmVuID0gW11cbiAgICAgICAgICBjLm5leHQucHJldiA9IGMucHJldlxuICAgICAgICAgIGMucHJldi5uZXh0ID0gYy5uZXh0XG4gICAgICAgICAgYy5uZXh0ID0gYy5wcmV2ID0gbnVsbFxuICAgICAgICAgIHJlbW92ZUZyb21EdWFsKHRoaXMsIG9wcG9zaXRlKVxuICAgICAgICAgIG9wcG9zaXRlLmNoaWxkcmVuID0gW11cbiAgICAgICAgICBvcHBvc2l0ZS5uZXh0LnByZXYgPSBvcHBvc2l0ZS5wcmV2XG4gICAgICAgICAgb3Bwb3NpdGUucHJldi5uZXh0ID0gb3Bwb3NpdGUubmV4dFxuICAgICAgICAgIG9wcG9zaXRlLm5leHQgPSBvcHBvc2l0ZS5wcmV2ID0gbnVsbFxuICAgICAgICAgIGZvcih2YXIgaz0wOyBrPGMudmVydGljZXMubGVuZ3RoOyArK2spIHtcbiAgICAgICAgICAgIGlmKGMudmVydGljZXNba10gPT09IHYpIHtcbiAgICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBudiA9IGMudmVydGljZXMuc2xpY2UoKVxuICAgICAgICAgICAgbnZba10gPSBvcHBvc2l0ZV9pbmRleFxuICAgICAgICAgICAgLy9DcmVhdGUgYW5kIGxpbmsgY2VsbFxuICAgICAgICAgICAgdmFyIG5jaGlsZCA9IG5ldyBTaW1wbGV4KHRoaXMsIG52LCBudWxsLCB0aGlzLm5leHQsIHRoaXMpXG4gICAgICAgICAgICB0aGlzLm5leHQucHJldiA9IG5jaGlsZFxuICAgICAgICAgICAgdGhpcy5uZXh0ID0gbmNoaWxkXG4gICAgICAgICAgICBmb3IodmFyIGw9MDsgbDxudi5sZW5ndGg7ICsrbCkge1xuICAgICAgICAgICAgICB0aGlzLl9kdWFsW252W2xdXS5wdXNoKG5jaGlsZClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vQWRkIHRvIGNoaWxkIHBvaW50ZXJzXG4gICAgICAgICAgICBjLmNoaWxkcmVuLnB1c2gobmNoaWxkKVxuICAgICAgICAgICAgb3Bwb3NpdGUuY2hpbGRyZW4ucHVzaChuY2hpbGQpXG4gICAgICAgICAgICAvL01hcmsgdG8gdmlzaXRcbiAgICAgICAgICAgIHRvX3Zpc2l0LnB1c2gobmNoaWxkKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBicmVhayBkb19mbGlwXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmRwcm90by5sb2NhdGUgPSBmdW5jdGlvbihwKSB7XG4gIHZhciBjID0gdGhpcy5fcm9vdFxuICB3aGlsZShjLmNoaWxkcmVuKSB7XG4gICAgZm9yKHZhciBpPTA7IGk8Yy5jaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgaWYoYy5jaGlsZHJlbltpXS5jb250YWlucyhwKSkge1xuICAgICAgICBjID0gYy5jaGlsZHJlbltpXVxuICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gYy52ZXJ0aWNlc1xufVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZHByb3RvLCBcImNlbGxzXCIsIHtcbiAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICB2YXIgciA9IFtdXG4gICAgZm9yKHZhciBjdXI9dGhpcy5uZXh0OyBjdXIgIT09IHRoaXM7IGN1ciA9IGN1ci5uZXh0KSB7XG4gICAgICByLnB1c2goY3VyLnZlcnRpY2VzKVxuICAgIH1cbiAgICByZXR1cm4gclxuICB9XG59KVxuXG5mdW5jdGlvbiBjcmVhdGVCb3VuZGluZ1NpbXBsZXgoZGltZW5zaW9uKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgQXJyYXkoZGltZW5zaW9uKzEpXG4gIGZvcih2YXIgaT0wOyBpPD1kaW1lbnNpb247ICsraSkge1xuICAgIHJlc3VsdFtpXSA9IG5ldyBBcnJheShkaW1lbnNpb24pXG4gIH1cbiAgZm9yKHZhciBpPTE7IGk8PWRpbWVuc2lvbjsgKytpKSB7XG4gICAgcmVzdWx0W2ldW2ktMV0gPSAxZTMwXG4gICAgZm9yKHZhciBqPTA7IGo8aS0xOyArK2opIHtcbiAgICAgIHJlc3VsdFtpXVtqXSA9IDAuMFxuICAgIH1cbiAgICBmb3IodmFyIGo9MDsgajxpOyArK2opIHtcbiAgICAgIHJlc3VsdFtqXVtpLTFdID0gLTFlMzBcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBjcmVhdGVEZWxhdW5heVRyaWFuZ3VsYXRpb24oZGltZW5zaW9uLCBwb2ludHMpIHtcbiAgdmFyIGJvdW5kcyA9IGNyZWF0ZUJvdW5kaW5nU2ltcGxleChkaW1lbnNpb24pXG4gIHZhciByb290ID0gbmV3IFNpbXBsZXgobnVsbCwgaW90YShkaW1lbnNpb24rMSksIG51bGwsIG51bGwsIG51bGwpXG4gIHZhciBkdWFsID0gbmV3IEFycmF5KGRpbWVuc2lvbisxKVxuICBmb3IodmFyIGk9MDsgaTxkdWFsLmxlbmd0aDsgKytpKSB7XG4gICAgZHVhbFtpXSA9IFtyb290XVxuICB9XG4gIHZhciB0cmlhbmd1bGF0aW9uID0gbmV3IERlbGF1bmF5VHJpYW5ndWxhdGlvbihib3VuZHMsIGR1YWwsIHJvb3QpXG4gIHJvb3QudHJpYW5ndWxhdGlvbiA9IHRyaWFuZ3VsYXRpb25cbiAgcm9vdC5uZXh0ID0gcm9vdC5wcmV2ID0gdHJpYW5ndWxhdGlvblxuICB0cmlhbmd1bGF0aW9uLm5leHQgPSB0cmlhbmd1bGF0aW9uLnByZXYgPSByb290XG4gIGlmKHBvaW50cykge1xuICAgIHZhciBzcG9pbnRzID0gZGVjay5zaHVmZmxlKHBvaW50cylcbiAgICBmb3IodmFyIGk9MDsgaTxzcG9pbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB0cmlhbmd1bGF0aW9uLmluc2VydChzcG9pbnRzW2ldKVxuICAgIH1cbiAgfVxuICByZXR1cm4gdHJpYW5ndWxhdGlvblxufSIsInZhciBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeHMpIHtcbiAgICBpZiAodHlwZW9mIHhzICE9PSAnb2JqZWN0JykgeyAvLyBvZiB3aGljaCBBcnJheXMgYXJlXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ011c3QgYmUgYW4gQXJyYXkgb3IgYW4gb2JqZWN0Jyk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBPYmplY3Qua2V5cyhleHBvcnRzKS5yZWR1Y2UoZnVuY3Rpb24gKGFjYywgbmFtZSkge1xuICAgICAgICBhY2NbbmFtZV0gPSBleHBvcnRzW25hbWVdLmJpbmQobnVsbCwgeHMpO1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcbn07XG5cbmV4cG9ydHMuc2h1ZmZsZSA9IGZ1bmN0aW9uICh4cykge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHhzKSkge1xuICAgICAgICAvLyB1bmlmb3JtIHNodWZmbGVcbiAgICAgICAgdmFyIHJlcyA9IHhzLnNsaWNlKCk7XG4gICAgICAgIGZvciAodmFyIGkgPSByZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIHZhciBuID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogaSk7XG4gICAgICAgICAgICB2YXIgdCA9IHJlc1tpXTtcbiAgICAgICAgICAgIHJlc1tpXSA9IHJlc1tuXTtcbiAgICAgICAgICAgIHJlc1tuXSA9IHQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIHhzID09PSAnb2JqZWN0Jykge1xuICAgICAgICAvLyB3ZWlnaHRlZCBzaHVmZmxlXG4gICAgICAgIHZhciB3ZWlnaHRzID0gT2JqZWN0LmtleXMoeHMpLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBrZXkpIHtcbiAgICAgICAgICAgIGFjY1trZXldID0geHNba2V5XTtcbiAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgXG4gICAgICAgIHZhciByZXQgPSBbXTtcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIChPYmplY3Qua2V5cyh3ZWlnaHRzKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB2YXIga2V5ID0gZXhwb3J0cy5waWNrKHdlaWdodHMpO1xuICAgICAgICAgICAgZGVsZXRlIHdlaWdodHNba2V5XTtcbiAgICAgICAgICAgIHJldC5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdNdXN0IGJlIGFuIEFycmF5IG9yIGFuIG9iamVjdCcpO1xuICAgIH1cbn07XG5cbmV4cG9ydHMucGljayA9IGZ1bmN0aW9uICh4cykge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHhzKSkge1xuICAgICAgICAvLyB1bmlmb3JtIHNhbXBsZVxuICAgICAgICByZXR1cm4geHNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogeHMubGVuZ3RoKV07XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiB4cyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgLy8gd2VpZ2h0ZWQgc2FtcGxlXG4gICAgICAgIHZhciB3ZWlnaHRzID0gZXhwb3J0cy5ub3JtYWxpemUoeHMpO1xuICAgICAgICBpZiAoIXdlaWdodHMpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIFxuICAgICAgICB2YXIgbiA9IE1hdGgucmFuZG9tKCk7XG4gICAgICAgIHZhciB0aHJlc2hvbGQgPSAwO1xuICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHdlaWdodHMpO1xuICAgICAgICBcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aHJlc2hvbGQgKz0gd2VpZ2h0c1trZXlzW2ldXTtcbiAgICAgICAgICAgIGlmIChuIDwgdGhyZXNob2xkKSByZXR1cm4ga2V5c1tpXTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4Y2VlZGVkIHRocmVzaG9sZC4gU29tZXRoaW5nIGlzIHZlcnkgd3JvbmcuJyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdNdXN0IGJlIGFuIEFycmF5IG9yIGFuIG9iamVjdCcpO1xuICAgIH1cbn07XG5cbmV4cG9ydHMubm9ybWFsaXplID0gZnVuY3Rpb24gKHdlaWdodHMpIHtcbiAgICBpZiAodHlwZW9mIHdlaWdodHMgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkod2VpZ2h0cykpIHtcbiAgICAgICAgdGhyb3cgJ05vdCBhbiBvYmplY3QnXG4gICAgfVxuICAgIFxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMod2VpZ2h0cyk7XG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIFxuICAgIHZhciB0b3RhbCA9IGtleXMucmVkdWNlKGZ1bmN0aW9uIChzdW0sIGtleSkge1xuICAgICAgICB2YXIgeCA9IHdlaWdodHNba2V5XTtcbiAgICAgICAgaWYgKHggPCAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05lZ2F0aXZlIHdlaWdodCBlbmNvdW50ZXJlZCBhdCBrZXkgJyArIGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHggIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdOdW1iZXIgZXhwZWN0ZWQsIGdvdCAnICsgdHlwZW9mIHgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHN1bSArIHg7XG4gICAgICAgIH1cbiAgICB9LCAwKTtcbiAgICBcbiAgICByZXR1cm4gdG90YWwgPT09IDFcbiAgICAgICAgPyB3ZWlnaHRzXG4gICAgICAgIDoga2V5cy5yZWR1Y2UoZnVuY3Rpb24gKGFjYywga2V5KSB7XG4gICAgICAgICAgICBhY2Nba2V5XSA9IHdlaWdodHNba2V5XSAvIHRvdGFsO1xuICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfSwge30pXG4gICAgO1xufTtcbiIsIlwidXNlIHN0cmljdFwiXG5cbmZ1bmN0aW9uIGlvdGEobikge1xuICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KG4pXG4gIGZvcih2YXIgaT0wOyBpPG47ICsraSkge1xuICAgIHJlc3VsdFtpXSA9IGlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaW90YSIsIlwidXNlIHN0cmljdFwiXG5cbnZhciB0d29Qcm9kdWN0ID0gcmVxdWlyZShcInR3by1wcm9kdWN0XCIpXG52YXIgcm9idXN0U3VtID0gcmVxdWlyZShcInJvYnVzdC1zdW1cIilcbnZhciByb2J1c3REaWZmID0gcmVxdWlyZShcInJvYnVzdC1zdWJ0cmFjdFwiKVxudmFyIHJvYnVzdFNjYWxlID0gcmVxdWlyZShcInJvYnVzdC1zY2FsZVwiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGdldEluU3BoZXJlXG5cbmZ1bmN0aW9uIGNvZmFjdG9yKG0sIGMpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShtLmxlbmd0aC0xKVxuICBmb3IodmFyIGk9MTsgaTxtLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHIgPSByZXN1bHRbaS0xXSA9IG5ldyBBcnJheShtLmxlbmd0aC0xKVxuICAgIGZvcih2YXIgaj0wLGs9MDsgajxtLmxlbmd0aDsgKytqKSB7XG4gICAgICBpZihqID09PSBjKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICByW2srK10gPSBtW2ldW2pdXG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gbWF0cml4KG4pIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShuKVxuICBmb3IodmFyIGk9MDsgaTxuOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSBuZXcgQXJyYXkobilcbiAgICBmb3IodmFyIGo9MDsgajxuOyArK2opIHtcbiAgICAgIHJlc3VsdFtpXVtqXSA9IFtcIm1bXCIsIGosIFwiXVtcIiwgKG4taS0yKSwgXCJdXCJdLmpvaW4oXCJcIilcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZVN1bShleHByKSB7XG4gIGlmKGV4cHIubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGV4cHJbMF1cbiAgfSBlbHNlIGlmKGV4cHIubGVuZ3RoID09PSAyKSB7XG4gICAgcmV0dXJuIFtcInN1bShcIiwgZXhwclswXSwgXCIsXCIsIGV4cHJbMV0sIFwiKVwiXS5qb2luKFwiXCIpXG4gIH0gZWxzZSB7XG4gICAgdmFyIG0gPSBleHByLmxlbmd0aD4+MVxuICAgIHJldHVybiBbXCJzdW0oXCIsIGdlbmVyYXRlU3VtKGV4cHIuc2xpY2UoMCwgbSkpLCBcIixcIiwgZ2VuZXJhdGVTdW0oZXhwci5zbGljZShtKSksIFwiKVwiXS5qb2luKFwiXCIpXG4gIH1cbn1cblxuZnVuY3Rpb24gbWFrZVByb2R1Y3QoYSwgYikge1xuICBpZihhLmNoYXJBdCgwKSA9PT0gXCJtXCIpIHtcbiAgICBpZihiLmNoYXJBdCgwKSA9PT0gXCJ3XCIpIHtcbiAgICAgIHZhciB0b2tzID0gYS5zcGxpdChcIl1cIilcbiAgICAgIHJldHVybiBbXCJ3XCIsIGIuc3Vic3RyKDEpLCBcIm1cIiwgdG9rc1swXS5zdWJzdHIoMildLmpvaW4oXCJcIilcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFtcInByb2QoXCIsIGEsIFwiLFwiLCBiLCBcIilcIl0uam9pbihcIlwiKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbWFrZVByb2R1Y3QoYiwgYSlcbiAgfVxufVxuXG5mdW5jdGlvbiBzaWduKHMpIHtcbiAgaWYocyAmIDEgIT09IDApIHtcbiAgICByZXR1cm4gXCItXCJcbiAgfVxuICByZXR1cm4gXCJcIlxufVxuXG5mdW5jdGlvbiBkZXRlcm1pbmFudChtKSB7XG4gIGlmKG0ubGVuZ3RoID09PSAyKSB7XG4gICAgcmV0dXJuIFtbXCJkaWZmKFwiLCBtYWtlUHJvZHVjdChtWzBdWzBdLCBtWzFdWzFdKSwgXCIsXCIsIG1ha2VQcm9kdWN0KG1bMV1bMF0sIG1bMF1bMV0pLCBcIilcIl0uam9pbihcIlwiKV1cbiAgfSBlbHNlIHtcbiAgICB2YXIgZXhwciA9IFtdXG4gICAgZm9yKHZhciBpPTA7IGk8bS5sZW5ndGg7ICsraSkge1xuICAgICAgZXhwci5wdXNoKFtcInNjYWxlKFwiLCBnZW5lcmF0ZVN1bShkZXRlcm1pbmFudChjb2ZhY3RvcihtLCBpKSkpLCBcIixcIiwgc2lnbihpKSwgbVswXVtpXSwgXCIpXCJdLmpvaW4oXCJcIikpXG4gICAgfVxuICAgIHJldHVybiBleHByXG4gIH1cbn1cblxuZnVuY3Rpb24gbWFrZVNxdWFyZShkLCBuKSB7XG4gIHZhciB0ZXJtcyA9IFtdXG4gIGZvcih2YXIgaT0wOyBpPG4tMjsgKytpKSB7XG4gICAgdGVybXMucHVzaChbXCJwcm9kKG1bXCIsIGQsIFwiXVtcIiwgaSwgXCJdLG1bXCIsIGQsIFwiXVtcIiwgaSwgXCJdKVwiXS5qb2luKFwiXCIpKVxuICB9XG4gIHJldHVybiBnZW5lcmF0ZVN1bSh0ZXJtcylcbn1cblxuZnVuY3Rpb24gb3JpZW50YXRpb24obikge1xuICB2YXIgcG9zID0gW11cbiAgdmFyIG5lZyA9IFtdXG4gIHZhciBtID0gbWF0cml4KG4pXG4gIGZvcih2YXIgaT0wOyBpPG47ICsraSkge1xuICAgIG1bMF1baV0gPSBcIjFcIlxuICAgIG1bbi0xXVtpXSA9IFwid1wiK2lcbiAgfSBcbiAgZm9yKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgaWYoKGkmMSk9PT0wKSB7XG4gICAgICBwb3MucHVzaC5hcHBseShwb3MsZGV0ZXJtaW5hbnQoY29mYWN0b3IobSwgaSkpKVxuICAgIH0gZWxzZSB7XG4gICAgICBuZWcucHVzaC5hcHBseShuZWcsZGV0ZXJtaW5hbnQoY29mYWN0b3IobSwgaSkpKVxuICAgIH1cbiAgfVxuICB2YXIgcG9zRXhwciA9IGdlbmVyYXRlU3VtKHBvcylcbiAgdmFyIG5lZ0V4cHIgPSBnZW5lcmF0ZVN1bShuZWcpXG4gIHZhciBjb2RlID0gW1wiZnVuY3Rpb24gaW5TcGhlcmVcIiwgbiwgXCIobSl7XCJdXG5cbiAgZm9yKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgY29kZS5wdXNoKFwidmFyIHdcIixpLFwiPVwiLG1ha2VTcXVhcmUoaSxuKSxcIjtcIilcbiAgICBmb3IodmFyIGo9MDsgajxuOyArK2opIHtcbiAgICAgIGlmKGogIT09IGkpIHtcbiAgICAgICAgY29kZS5wdXNoKFwidmFyIHdcIixpLFwibVwiLGosXCI9c2NhbGUod1wiLGksXCIsbVtcIixqLFwiXVswXSk7XCIpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29kZS5wdXNoKFwidmFyIHA9XCIsIHBvc0V4cHIsIFwiLG49XCIsIG5lZ0V4cHIsIFwiO1xcXG5mb3IodmFyIGk9cC5sZW5ndGgtMSxqPW4ubGVuZ3RoLTE7aT49MCYmaj49MDstLWksLS1qKXtcXFxuaWYocFtpXTxuW2pdKXtyZXR1cm4gLTF9ZWxzZSBpZihwW2ldPm5bal0pe3JldHVybiAxfX1cXFxuaWYoaT49MCl7cmV0dXJuIHBbaV0+MD8xOihwW2ldPDA/LTE6MCl9XFxcbmlmKGo+PTApe3JldHVybiBuW2pdPDA/MToobltqXT4wPy0xOjApfVxcXG5yZXR1cm4gMH07cmV0dXJuIGluU3BoZXJlXCIsIG4pXG5cbiAgdmFyIHByb2MgPSBuZXcgRnVuY3Rpb24oXCJzdW1cIiwgXCJkaWZmXCIsIFwicHJvZFwiLCBcInNjYWxlXCIsIGNvZGUuam9pbihcIlwiKSlcbiAgcmV0dXJuIHByb2Mocm9idXN0U3VtLCByb2J1c3REaWZmLCB0d29Qcm9kdWN0LCByb2J1c3RTY2FsZSlcbn1cblxudmFyIENBQ0hFRCA9IFtcbiAgZnVuY3Rpb24gaW5TcGhlcmUwKCkgeyByZXR1cm4gMCB9LFxuICBmdW5jdGlvbiBpblNwaGVyZTEoKSB7IHJldHVybiAwIH0sXG4gIGZ1bmN0aW9uIGluU3BoZXJlMigpIHsgcmV0dXJuIDAgfSxcbiAgZnVuY3Rpb24gaW5TcGhlcmUzKG0pIHsgXG4gICAgdmFyIGEgPSBtWzBdWzBdLCBiID0gbVsxXVswXSwgYyA9IG1bMl1bMF1cbiAgICBpZihhIDwgYikge1xuICAgICAgaWYoYSA8IGMpIHtcbiAgICAgICAgaWYoYyA8IGIpIHtcbiAgICAgICAgICByZXR1cm4gLTFcbiAgICAgICAgfSBlbHNlIGlmKGMgPiBiKSB7XG4gICAgICAgICAgcmV0dXJuIDFcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYoYSA9PT0gYykge1xuICAgICAgICByZXR1cm4gMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDFcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYoYiA8IGMpIHtcbiAgICAgICAgaWYoYyA8IGEpIHtcbiAgICAgICAgICByZXR1cm4gMVxuICAgICAgICB9IGVsc2UgaWYoYyA+IGEpIHtcbiAgICAgICAgICByZXR1cm4gLTFcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYoYiA9PT0gYykge1xuICAgICAgICByZXR1cm4gMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIC0xXG4gICAgICB9XG4gICAgfVxuICB9XG5dXG5cbmZ1bmN0aW9uIGdldEluU3BoZXJlKG0pIHtcbiAgd2hpbGUoQ0FDSEVELmxlbmd0aCA8PSBtLmxlbmd0aCkge1xuICAgIENBQ0hFRC5wdXNoKG9yaWVudGF0aW9uKENBQ0hFRC5sZW5ndGgpKVxuICB9XG4gIHZhciBwID0gQ0FDSEVEW20ubGVuZ3RoXVxuICByZXR1cm4gcChtKVxufSIsIlwidXNlIHN0cmljdFwiXG5cbm1vZHVsZS5leHBvcnRzID0gZmFzdFR3b1N1bVxuXG5mdW5jdGlvbiBmYXN0VHdvU3VtKGEsIGIsIHJlc3VsdCkge1xuXHR2YXIgeCA9IGEgKyBiXG5cdHZhciBidiA9IHggLSBhXG5cdHZhciBhdiA9IHggLSBidlxuXHR2YXIgYnIgPSBiIC0gYnZcblx0dmFyIGFyID0gYSAtIGF2XG5cdGlmKHJlc3VsdCkge1xuXHRcdHJlc3VsdFswXSA9IGFyICsgYnJcblx0XHRyZXN1bHRbMV0gPSB4XG5cdFx0cmV0dXJuIHJlc3VsdFxuXHR9XG5cdHJldHVybiBbYXIrYnIsIHhdXG59IiwiXCJ1c2Ugc3RyaWN0XCJcblxudmFyIHR3b1Byb2R1Y3QgPSByZXF1aXJlKFwidHdvLXByb2R1Y3RcIilcbnZhciB0d29TdW0gPSByZXF1aXJlKFwidHdvLXN1bVwiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNjYWxlTGluZWFyRXhwYW5zaW9uXG5cbmZ1bmN0aW9uIHNjYWxlTGluZWFyRXhwYW5zaW9uKGUsIHNjYWxlLCByZXN1bHQpIHtcblx0dmFyIG4gPSBlLmxlbmd0aFxuXHR2YXIgZ1xuXHRpZihyZXN1bHQpIHtcblx0XHRnID0gcmVzdWx0XG5cdH0gZWxzZSB7XG5cdFx0ZyA9IG5ldyBBcnJheSgyICogbilcblx0fVxuXHR2YXIgcSA9IFswLjEsIDAuMV1cblx0dmFyIHQgPSBbMC4xLCAwLjFdXG5cdHZhciBjb3VudCA9IDBcblx0dHdvUHJvZHVjdChlWzBdLCBzY2FsZSwgcSlcblx0aWYocVswXSkge1xuXHRcdGdbY291bnQrK10gPSBxWzBdXG5cdH1cblx0Zm9yKHZhciBpPTE7IGk8bjsgKytpKSB7XG5cdFx0dHdvUHJvZHVjdChlW2ldLCBzY2FsZSwgdClcblx0XHR0d29TdW0ocVsxXSwgdFswXSwgcSlcblx0XHRpZihxWzBdKSB7XG5cdFx0XHRnW2NvdW50KytdID0gcVswXVxuXHRcdH1cblx0XHR2YXIgYSA9IHRbMV1cblx0XHR2YXIgYiA9IHFbMV1cblx0XHR2YXIgeCA9IGEgKyBiXG5cdFx0dmFyIGJ2ID0geCAtIGFcblx0XHR2YXIgeSA9IGIgLSBidlxuXHRcdHFbMV0gPSB4XG5cdFx0aWYoeSkge1xuXHRcdFx0Z1tjb3VudCsrXSA9IHlcblx0XHR9XG5cdH1cblx0aWYocVsxXSkge1xuXHRcdGdbY291bnQrK10gPSBxWzFdXG5cdH1cblx0aWYoY291bnQgPT09IDApIHtcblx0XHRnW2NvdW50KytdID0gMC4wXG5cdH1cblx0aWYocmVzdWx0KSB7XG4gICAgaWYoY291bnQgPCBnLmxlbmd0aCkge1xuICAgICAgdmFyIHB0ciA9IGcubGVuZ3RoLTFcbiAgICAgIGNvdW50LS1cbiAgICAgIHdoaWxlKGNvdW50ID49IDApIHtcbiAgICAgICAgZ1twdHItLV0gPSBnW2NvdW50LS1dXG4gICAgICB9XG4gICAgICB3aGlsZShwdHIgPj0gMCkge1xuICAgICAgICBnW3B0ci0tXSA9IDAuMFxuICAgICAgfVxuICAgIH1cblx0XHRyZXR1cm4gZ1xuXHR9XG5cdGcubGVuZ3RoID0gY291bnRcblx0cmV0dXJuIGdcbn0iLCJcInVzZSBzdHJpY3RcIlxuXG52YXIgc3VtID0gcmVxdWlyZShcInJvYnVzdC1zdW1cIilcblxubW9kdWxlLmV4cG9ydHMgPSByb2J1c3REaWZmXG5cbmZ1bmN0aW9uIHJvYnVzdERpZmYoYSxiKSB7XG4gIHZhciBjID0gYi5zbGljZSgpXG4gIGZvcih2YXIgaT0wOyBpPGMubGVuZ3RoOyArK2kpIHtcbiAgICBjW2ldID0gLWNbaV1cbiAgfVxuICByZXR1cm4gc3VtKGEsYylcbn0iLCJcInVzZSBzdHJpY3RcIlxuXG5mdW5jdGlvbiBtZXJnZTJfY21wKGEsIGIsIHJlc3VsdCwgY29tcGFyZSkge1xuICB2YXIgYV9wdHIgPSAwXG4gICAgLCBiX3B0ciA9IDBcbiAgICAsIHJfcHRyID0gMFxuICB3aGlsZShhX3B0ciA8IGEubGVuZ3RoICYmIGJfcHRyIDwgYi5sZW5ndGgpIHtcbiAgICBpZihjb21wYXJlKGFbYV9wdHJdLCBiW2JfcHRyXSkgPD0gMCkge1xuICAgICAgcmVzdWx0W3JfcHRyKytdID0gYVthX3B0cisrXVxuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHRbcl9wdHIrK10gPSBiW2JfcHRyKytdXG4gICAgfVxuICB9XG4gIHdoaWxlKGFfcHRyIDwgYS5sZW5ndGgpIHtcbiAgICByZXN1bHRbcl9wdHIrK10gPSBhW2FfcHRyKytdXG4gIH1cbiAgd2hpbGUoYl9wdHIgPCBiLmxlbmd0aCkge1xuICAgIHJlc3VsdFtyX3B0cisrXSA9IGJbYl9wdHIrK11cbiAgfVxufVxuXG5mdW5jdGlvbiBtZXJnZTJfZGVmKGEsIGIsIHJlc3VsdCkge1xuICB2YXIgYV9wdHIgPSAwXG4gICAgLCBiX3B0ciA9IDBcbiAgICAsIHJfcHRyID0gMFxuICB3aGlsZShhX3B0ciA8IGEubGVuZ3RoICYmIGJfcHRyIDwgYi5sZW5ndGgpIHtcbiAgICBpZihhW2FfcHRyXSA8PSBiW2JfcHRyXSkge1xuICAgICAgcmVzdWx0W3JfcHRyKytdID0gYVthX3B0cisrXVxuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHRbcl9wdHIrK10gPSBiW2JfcHRyKytdXG4gICAgfVxuICB9XG4gIHdoaWxlKGFfcHRyIDwgYS5sZW5ndGgpIHtcbiAgICByZXN1bHRbcl9wdHIrK10gPSBhW2FfcHRyKytdXG4gIH1cbiAgd2hpbGUoYl9wdHIgPCBiLmxlbmd0aCkge1xuICAgIHJlc3VsdFtyX3B0cisrXSA9IGJbYl9wdHIrK11cbiAgfVxufVxuXG5mdW5jdGlvbiBtZXJnZTIoYSwgYiwgY29tcGFyZSwgcmVzdWx0KSB7XG4gIGlmKCFyZXN1bHQpIHtcbiAgICByZXN1bHQgPSBuZXcgQXJyYXkoYS5sZW5ndGggKyBiLmxlbmd0aClcbiAgfVxuICBpZihjb21wYXJlKSB7XG4gICAgbWVyZ2UyX2NtcChhLCBiLCByZXN1bHQsIGNvbXBhcmUpXG4gIH0gZWxzZSB7XG4gICAgbWVyZ2UyX2RlZihhLCBiLCByZXN1bHQpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1lcmdlMiIsIm1vZHVsZS5leHBvcnRzPXJlcXVpcmUoNSkiLCJcInVzZSBzdHJpY3RcIlxuXG52YXIgdHdvU3VtID0gcmVxdWlyZShcInR3by1zdW1cIilcbnZhciBiaW5hcnlNZXJnZSA9IHJlcXVpcmUoXCJiaW5hcnktbWVyZ2VcIilcblxubW9kdWxlLmV4cG9ydHMgPSBsaW5lYXJFeHBhbnNpb25TdW1cblxuZnVuY3Rpb24gY29tcGFyZU1hZ25pdHVkZXMoYSwgYikge1xuICByZXR1cm4gTWF0aC5hYnMoYSkgLSBNYXRoLmFicyhiKVxufVxuXG5mdW5jdGlvbiBsaW5lYXJFeHBhbnNpb25TdW0oZSwgZiwgcmVzdWx0KSB7XG4gIHZhciBnID0gYmluYXJ5TWVyZ2UoZSwgZiwgY29tcGFyZU1hZ25pdHVkZXMsIHJlc3VsdClcbiAgdmFyIG4gPSBlLmxlbmd0aCArIGYubGVuZ3RoXG4gIHZhciBjb3VudCA9IDBcbiAgdmFyIGEgPSBnWzFdXG4gIHZhciBiID0gZ1swXVxuICB2YXIgeCA9IGEgKyBiXG4gIHZhciBidiA9IHggLSBhXG4gIHZhciB5ID0gYiAtIGJ2XG4gIHZhciBxID0gW3ksIHhdXG4gIGZvcih2YXIgaT0yOyBpPG47ICsraSkge1xuICAgIGEgPSBnW2ldXG4gICAgYiA9IHFbMF0gfHwgMC4wXG4gICAgeCA9IGEgKyBiXG4gICAgYnYgPSB4IC0gYVxuICAgIHkgPSBiIC0gYnZcbiAgICBpZih5KSB7XG4gICAgICBnW2NvdW50KytdID0geVxuICAgIH1cbiAgICB0d29TdW0ocVsxXSwgeCwgcSlcbiAgfVxuICBpZihxWzBdKSB7XG4gICAgZ1tjb3VudCsrXSA9IHFbMF1cbiAgfVxuICBpZihxWzFdKSB7XG4gICAgZ1tjb3VudCsrXSA9IHFbMV1cbiAgfVxuICBpZighY291bnQpIHtcbiAgICBnW2NvdW50KytdID0gMC4wXG4gIH1cbiAgaWYocmVzdWx0KSB7XG4gICAgaWYoY291bnQgPCBnLmxlbmd0aCkge1xuICAgICAgdmFyIHB0ciA9IGcubGVuZ3RoLTFcbiAgICAgIGNvdW50LS1cbiAgICAgIHdoaWxlKGNvdW50ID49IDApIHtcbiAgICAgICAgZ1twdHItLV0gPSBnW2NvdW50LS1dXG4gICAgICB9XG4gICAgICB3aGlsZShwdHIgPj0gMCkge1xuICAgICAgICBnW3B0ci0tXSA9IDAuMFxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBnLmxlbmd0aCA9IGNvdW50XG4gIH1cbiAgcmV0dXJuIGdcbn0iLCJcInVzZSBzdHJpY3RcIlxuXG5tb2R1bGUuZXhwb3J0cyA9IHR3b1Byb2R1Y3RcblxudmFyIEhBTEZfRE9VQkxFID0gKDE8PDI2KSArIDFcblxuZnVuY3Rpb24gdHdvUHJvZHVjdChhLCBiLCByZXN1bHQpIHtcblx0dmFyIHggPSBhICogYlxuXG5cdHZhciBjID0gSEFMRl9ET1VCTEUgKiBhXG5cdHZhciBhYmlnID0gYyAtIGFcblx0dmFyIGFoaSA9IGMgLSBhYmlnXG5cdHZhciBhbG8gPSBhIC0gYWhpXG5cdFxuXHR2YXIgZCA9IEhBTEZfRE9VQkxFICogYlxuXHR2YXIgYmJpZyA9IGQgLSBiXG5cdHZhciBiaGkgPSBkIC0gYmJpZ1xuXHR2YXIgYmxvID0gYiAtIGJoaVxuXHRcblx0dmFyIGVycjEgPSB4IC0gKGFoaSAqIGJoaSlcblx0dmFyIGVycjIgPSBlcnIxIC0gKGFsbyAqIGJoaSlcblx0dmFyIGVycjMgPSBlcnIyIC0gKGFoaSAqIGJsbylcblx0XG5cdHZhciB5ID0gYWxvICogYmxvIC0gZXJyM1xuXG5cdGlmKHJlc3VsdCkge1xuXHRcdHJlc3VsdFswXSA9IHkgfHwgMC4wXG5cdFx0cmVzdWx0WzFdID0geCB8fCAwLjBcblx0XHRyZXR1cm4gcmVzdWx0XG5cdH1cblx0XG5cdHJldHVybiBbIHkgfHwgMC4wLCB4IHx8IDAuMCBcdF1cbn0iLCJtb2R1bGUuZXhwb3J0cz1yZXF1aXJlKDUpIiwibW9kdWxlLmV4cG9ydHM9cmVxdWlyZSg2KSIsIm1vZHVsZS5leHBvcnRzPXJlcXVpcmUoOCkiLCJtb2R1bGUuZXhwb3J0cz1yZXF1aXJlKDUpIiwibW9kdWxlLmV4cG9ydHM9cmVxdWlyZSgxMCkiLCJtb2R1bGUuZXhwb3J0cz1yZXF1aXJlKDExKSIsIlwidXNlIHN0cmljdFwiXG5cbnZhciB0d29Qcm9kdWN0ID0gcmVxdWlyZShcInR3by1wcm9kdWN0XCIpXG52YXIgcm9idXN0U3VtID0gcmVxdWlyZShcInJvYnVzdC1zdW1cIilcbnZhciByb2J1c3RTY2FsZSA9IHJlcXVpcmUoXCJyb2J1c3Qtc2NhbGVcIilcblxubW9kdWxlLmV4cG9ydHMgPSBnZXRPcmllbnRhdGlvblxuXG5mdW5jdGlvbiBjb2ZhY3RvcihtLCBjKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgQXJyYXkobS5sZW5ndGgtMSlcbiAgZm9yKHZhciBpPTE7IGk8bS5sZW5ndGg7ICsraSkge1xuICAgIHZhciByID0gcmVzdWx0W2ktMV0gPSBuZXcgQXJyYXkobS5sZW5ndGgtMSlcbiAgICBmb3IodmFyIGo9MCxrPTA7IGo8bS5sZW5ndGg7ICsraikge1xuICAgICAgaWYoaiA9PT0gYykge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgcltrKytdID0gbVtpXVtqXVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIG1hdHJpeChuKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgQXJyYXkobilcbiAgZm9yKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gbmV3IEFycmF5KG4pXG4gICAgZm9yKHZhciBqPTA7IGo8bjsgKytqKSB7XG4gICAgICByZXN1bHRbaV1bal0gPSBbXCJtW1wiLCBqLCBcIl1bXCIsIChuLWktMSksIFwiXVwiXS5qb2luKFwiXCIpXG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gc2lnbihuKSB7XG4gIGlmKG4gJiAxKSB7XG4gICAgcmV0dXJuIFwiLVwiXG4gIH1cbiAgcmV0dXJuIFwiXCJcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVTdW0oZXhwcikge1xuICBpZihleHByLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBleHByWzBdXG4gIH0gZWxzZSBpZihleHByLmxlbmd0aCA9PT0gMikge1xuICAgIHJldHVybiBbXCJzdW0oXCIsIGV4cHJbMF0sIFwiLFwiLCBleHByWzFdLCBcIilcIl0uam9pbihcIlwiKVxuICB9IGVsc2Uge1xuICAgIHZhciBtID0gZXhwci5sZW5ndGg+PjFcbiAgICByZXR1cm4gW1wic3VtKFwiLCBnZW5lcmF0ZVN1bShleHByLnNsaWNlKDAsIG0pKSwgXCIsXCIsIGdlbmVyYXRlU3VtKGV4cHIuc2xpY2UobSkpLCBcIilcIl0uam9pbihcIlwiKVxuICB9XG59XG5cbmZ1bmN0aW9uIGRldGVybWluYW50KG0pIHtcbiAgaWYobS5sZW5ndGggPT09IDIpIHtcbiAgICByZXR1cm4gW1wic3VtKHByb2QoXCIsIG1bMF1bMF0sIFwiLFwiLCBtWzFdWzFdLCBcIikscHJvZCgtXCIsIG1bMF1bMV0sIFwiLFwiLCBtWzFdWzBdLCBcIikpXCJdLmpvaW4oXCJcIilcbiAgfSBlbHNlIHtcbiAgICB2YXIgZXhwciA9IFtdXG4gICAgZm9yKHZhciBpPTA7IGk8bS5sZW5ndGg7ICsraSkge1xuICAgICAgZXhwci5wdXNoKFtcInNjYWxlKFwiLCBkZXRlcm1pbmFudChjb2ZhY3RvcihtLCBpKSksIFwiLFwiLCBzaWduKGkpLCBtWzBdW2ldLCBcIilcIl0uam9pbihcIlwiKSlcbiAgICB9XG4gICAgcmV0dXJuIGdlbmVyYXRlU3VtKGV4cHIpXG4gIH1cbn1cblxuZnVuY3Rpb24gb3JpZW50YXRpb24obikge1xuICB2YXIgcG9zID0gW11cbiAgdmFyIG5lZyA9IFtdXG4gIHZhciBtID0gbWF0cml4KG4pXG4gIGZvcih2YXIgaT0wOyBpPG47ICsraSkge1xuICAgIGlmKChpJjEpPT09MCkge1xuICAgICAgcG9zLnB1c2goZGV0ZXJtaW5hbnQoY29mYWN0b3IobSwgaSkpKVxuICAgIH0gZWxzZSB7XG4gICAgICBuZWcucHVzaChkZXRlcm1pbmFudChjb2ZhY3RvcihtLCBpKSkpXG4gICAgfVxuICB9XG4gIHZhciBwb3NFeHByID0gZ2VuZXJhdGVTdW0ocG9zKVxuICB2YXIgbmVnRXhwciA9IGdlbmVyYXRlU3VtKG5lZylcbiAgdmFyIGNvZGUgPSBbXCJmdW5jdGlvbiBvcmllbnRhdGlvblwiLCBuLCBcIihtKXt2YXIgcD1cIiwgcG9zRXhwciwgXCIsbj1cIiwgbmVnRXhwciwgXCI7XFxcbmZvcih2YXIgaT1wLmxlbmd0aC0xLGo9bi5sZW5ndGgtMTtpPj0wJiZqPj0wOy0taSwtLWope1xcXG5pZihwW2ldPG5bal0pe3JldHVybiAtMX1lbHNlIGlmKHBbaV0+bltqXSl7cmV0dXJuIDF9fVxcXG5pZihpPj0wKXtyZXR1cm4gcFtpXT4wPzE6KHBbaV08MD8tMTowKX1cXFxuaWYoaj49MCl7cmV0dXJuIG5bal08MD8xOihuW2pdPjA/LTE6MCl9XFxcbnJldHVybiAwfTtyZXR1cm4gb3JpZW50YXRpb25cIiwgbl0uam9pbihcIlwiKVxuICB2YXIgcHJvYyA9IG5ldyBGdW5jdGlvbihcInN1bVwiLCBcInByb2RcIiwgXCJzY2FsZVwiLCBjb2RlKVxuICByZXR1cm4gcHJvYyhyb2J1c3RTdW0sIHR3b1Byb2R1Y3QsIHJvYnVzdFNjYWxlKVxufVxuXG52YXIgQ0FDSEVEID0gW1xuICBmdW5jdGlvbiBvcmllbnRhdGlvbjAoKSB7IHJldHVybiAwIH0sXG4gIGZ1bmN0aW9uIG9yaWVudGF0aW9uMSgpIHsgcmV0dXJuIDAgfSxcbiAgZnVuY3Rpb24gb3JpZW50YXRpb24yKGEpIHsgXG4gICAgdmFyIGQgPSBhWzBdWzBdIC0gYVsxXVswXVxuICAgIGlmKGQgPCAwKSB7IHJldHVybiAtMSB9XG4gICAgaWYoZCA+IDApIHsgcmV0dXJuIDEgfVxuICAgIHJldHVybiAwXG4gIH1cbl1cblxuZnVuY3Rpb24gZ2V0T3JpZW50YXRpb24obSkge1xuICB3aGlsZShDQUNIRUQubGVuZ3RoIDw9IG0ubGVuZ3RoKSB7XG4gICAgQ0FDSEVELnB1c2gob3JpZW50YXRpb24oQ0FDSEVELmxlbmd0aCkpXG4gIH1cbiAgdmFyIHAgPSBDQUNIRURbbS5sZW5ndGhdXG4gIHJldHVybiBwKG0pXG59IiwiXCJ1c2Ugc3RyaWN0XCJcblxudmFyIG9yaWVudGF0aW9uID0gcmVxdWlyZShcInJvYnVzdC1vcmllbnRhdGlvblwiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGluU2ltcGxleFxuXG5mdW5jdGlvbiBpblNpbXBsZXgoc2ltcGxleCwgcG9pbnQpIHtcbiAgdmFyIHMgPSBvcmllbnRhdGlvbihzaW1wbGV4KVxuICB2YXIgc2NvcHkgPSBzaW1wbGV4LnNsaWNlKClcbiAgdmFyIGJvdW5kYXJ5ID0gZmFsc2VcbiAgZm9yKHZhciBpPTA7IGk8c2ltcGxleC5sZW5ndGg7ICsraSkge1xuICAgIHNjb3B5W2ldID0gcG9pbnRcbiAgICB2YXIgbyA9IG9yaWVudGF0aW9uKHNjb3B5KVxuICAgIHNjb3B5W2ldID0gc2ltcGxleFtpXVxuICAgIGlmKG8pIHtcbiAgICAgIGlmKG8gIT09IHMpIHtcbiAgICAgICAgcmV0dXJuIC0xXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGJvdW5kYXJ5ID0gdHJ1ZVxuICAgIH1cbiAgfVxuICBpZihib3VuZGFyeSkge1xuICAgIHJldHVybiAwXG4gIH1cbiAgcmV0dXJuIDFcbn0iLCIvKipcbiAqIEJpdCB0d2lkZGxpbmcgaGFja3MgZm9yIEphdmFTY3JpcHQuXG4gKlxuICogQXV0aG9yOiBNaWtvbGEgTHlzZW5rb1xuICpcbiAqIFBvcnRlZCBmcm9tIFN0YW5mb3JkIGJpdCB0d2lkZGxpbmcgaGFjayBsaWJyYXJ5OlxuICogICAgaHR0cDovL2dyYXBoaWNzLnN0YW5mb3JkLmVkdS9+c2VhbmRlci9iaXRoYWNrcy5odG1sXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7IFwidXNlIHJlc3RyaWN0XCI7XG5cbi8vTnVtYmVyIG9mIGJpdHMgaW4gYW4gaW50ZWdlclxudmFyIElOVF9CSVRTID0gMzI7XG5cbi8vQ29uc3RhbnRzXG5leHBvcnRzLklOVF9CSVRTICA9IElOVF9CSVRTO1xuZXhwb3J0cy5JTlRfTUFYICAgPSAgMHg3ZmZmZmZmZjtcbmV4cG9ydHMuSU5UX01JTiAgID0gLTE8PChJTlRfQklUUy0xKTtcblxuLy9SZXR1cm5zIC0xLCAwLCArMSBkZXBlbmRpbmcgb24gc2lnbiBvZiB4XG5leHBvcnRzLnNpZ24gPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiAodiA+IDApIC0gKHYgPCAwKTtcbn1cblxuLy9Db21wdXRlcyBhYnNvbHV0ZSB2YWx1ZSBvZiBpbnRlZ2VyXG5leHBvcnRzLmFicyA9IGZ1bmN0aW9uKHYpIHtcbiAgdmFyIG1hc2sgPSB2ID4+IChJTlRfQklUUy0xKTtcbiAgcmV0dXJuICh2IF4gbWFzaykgLSBtYXNrO1xufVxuXG4vL0NvbXB1dGVzIG1pbmltdW0gb2YgaW50ZWdlcnMgeCBhbmQgeVxuZXhwb3J0cy5taW4gPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiB5IF4gKCh4IF4geSkgJiAtKHggPCB5KSk7XG59XG5cbi8vQ29tcHV0ZXMgbWF4aW11bSBvZiBpbnRlZ2VycyB4IGFuZCB5XG5leHBvcnRzLm1heCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgcmV0dXJuIHggXiAoKHggXiB5KSAmIC0oeCA8IHkpKTtcbn1cblxuLy9DaGVja3MgaWYgYSBudW1iZXIgaXMgYSBwb3dlciBvZiB0d29cbmV4cG9ydHMuaXNQb3cyID0gZnVuY3Rpb24odikge1xuICByZXR1cm4gISh2ICYgKHYtMSkpICYmICghIXYpO1xufVxuXG4vL0NvbXB1dGVzIGxvZyBiYXNlIDIgb2YgdlxuZXhwb3J0cy5sb2cyID0gZnVuY3Rpb24odikge1xuICB2YXIgciwgc2hpZnQ7XG4gIHIgPSAgICAgKHYgPiAweEZGRkYpIDw8IDQ7IHYgPj4+PSByO1xuICBzaGlmdCA9ICh2ID4gMHhGRiAgKSA8PCAzOyB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnQ7XG4gIHNoaWZ0ID0gKHYgPiAweEYgICApIDw8IDI7IHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdDtcbiAgc2hpZnQgPSAodiA+IDB4MyAgICkgPDwgMTsgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0O1xuICByZXR1cm4gciB8ICh2ID4+IDEpO1xufVxuXG4vL0NvbXB1dGVzIGxvZyBiYXNlIDEwIG9mIHZcbmV4cG9ydHMubG9nMTAgPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiAgKHYgPj0gMTAwMDAwMDAwMCkgPyA5IDogKHYgPj0gMTAwMDAwMDAwKSA/IDggOiAodiA+PSAxMDAwMDAwMCkgPyA3IDpcbiAgICAgICAgICAodiA+PSAxMDAwMDAwKSA/IDYgOiAodiA+PSAxMDAwMDApID8gNSA6ICh2ID49IDEwMDAwKSA/IDQgOlxuICAgICAgICAgICh2ID49IDEwMDApID8gMyA6ICh2ID49IDEwMCkgPyAyIDogKHYgPj0gMTApID8gMSA6IDA7XG59XG5cbi8vQ291bnRzIG51bWJlciBvZiBiaXRzXG5leHBvcnRzLnBvcENvdW50ID0gZnVuY3Rpb24odikge1xuICB2ID0gdiAtICgodiA+Pj4gMSkgJiAweDU1NTU1NTU1KTtcbiAgdiA9ICh2ICYgMHgzMzMzMzMzMykgKyAoKHYgPj4+IDIpICYgMHgzMzMzMzMzMyk7XG4gIHJldHVybiAoKHYgKyAodiA+Pj4gNCkgJiAweEYwRjBGMEYpICogMHgxMDEwMTAxKSA+Pj4gMjQ7XG59XG5cbi8vQ291bnRzIG51bWJlciBvZiB0cmFpbGluZyB6ZXJvc1xuZnVuY3Rpb24gY291bnRUcmFpbGluZ1plcm9zKHYpIHtcbiAgdmFyIGMgPSAzMjtcbiAgdiAmPSAtdjtcbiAgaWYgKHYpIGMtLTtcbiAgaWYgKHYgJiAweDAwMDBGRkZGKSBjIC09IDE2O1xuICBpZiAodiAmIDB4MDBGRjAwRkYpIGMgLT0gODtcbiAgaWYgKHYgJiAweDBGMEYwRjBGKSBjIC09IDQ7XG4gIGlmICh2ICYgMHgzMzMzMzMzMykgYyAtPSAyO1xuICBpZiAodiAmIDB4NTU1NTU1NTUpIGMgLT0gMTtcbiAgcmV0dXJuIGM7XG59XG5leHBvcnRzLmNvdW50VHJhaWxpbmdaZXJvcyA9IGNvdW50VHJhaWxpbmdaZXJvcztcblxuLy9Sb3VuZHMgdG8gbmV4dCBwb3dlciBvZiAyXG5leHBvcnRzLm5leHRQb3cyID0gZnVuY3Rpb24odikge1xuICB2ICs9IHYgPT09IDA7XG4gIC0tdjtcbiAgdiB8PSB2ID4+PiAxO1xuICB2IHw9IHYgPj4+IDI7XG4gIHYgfD0gdiA+Pj4gNDtcbiAgdiB8PSB2ID4+PiA4O1xuICB2IHw9IHYgPj4+IDE2O1xuICByZXR1cm4gdiArIDE7XG59XG5cbi8vUm91bmRzIGRvd24gdG8gcHJldmlvdXMgcG93ZXIgb2YgMlxuZXhwb3J0cy5wcmV2UG93MiA9IGZ1bmN0aW9uKHYpIHtcbiAgdiB8PSB2ID4+PiAxO1xuICB2IHw9IHYgPj4+IDI7XG4gIHYgfD0gdiA+Pj4gNDtcbiAgdiB8PSB2ID4+PiA4O1xuICB2IHw9IHYgPj4+IDE2O1xuICByZXR1cm4gdiAtICh2Pj4+MSk7XG59XG5cbi8vQ29tcHV0ZXMgcGFyaXR5IG9mIHdvcmRcbmV4cG9ydHMucGFyaXR5ID0gZnVuY3Rpb24odikge1xuICB2IF49IHYgPj4+IDE2O1xuICB2IF49IHYgPj4+IDg7XG4gIHYgXj0gdiA+Pj4gNDtcbiAgdiAmPSAweGY7XG4gIHJldHVybiAoMHg2OTk2ID4+PiB2KSAmIDE7XG59XG5cbnZhciBSRVZFUlNFX1RBQkxFID0gbmV3IEFycmF5KDI1Nik7XG5cbihmdW5jdGlvbih0YWIpIHtcbiAgZm9yKHZhciBpPTA7IGk8MjU2OyArK2kpIHtcbiAgICB2YXIgdiA9IGksIHIgPSBpLCBzID0gNztcbiAgICBmb3IgKHYgPj4+PSAxOyB2OyB2ID4+Pj0gMSkge1xuICAgICAgciA8PD0gMTtcbiAgICAgIHIgfD0gdiAmIDE7XG4gICAgICAtLXM7XG4gICAgfVxuICAgIHRhYltpXSA9IChyIDw8IHMpICYgMHhmZjtcbiAgfVxufSkoUkVWRVJTRV9UQUJMRSk7XG5cbi8vUmV2ZXJzZSBiaXRzIGluIGEgMzIgYml0IHdvcmRcbmV4cG9ydHMucmV2ZXJzZSA9IGZ1bmN0aW9uKHYpIHtcbiAgcmV0dXJuICAoUkVWRVJTRV9UQUJMRVsgdiAgICAgICAgICYgMHhmZl0gPDwgMjQpIHxcbiAgICAgICAgICAoUkVWRVJTRV9UQUJMRVsodiA+Pj4gOCkgICYgMHhmZl0gPDwgMTYpIHxcbiAgICAgICAgICAoUkVWRVJTRV9UQUJMRVsodiA+Pj4gMTYpICYgMHhmZl0gPDwgOCkgIHxcbiAgICAgICAgICAgUkVWRVJTRV9UQUJMRVsodiA+Pj4gMjQpICYgMHhmZl07XG59XG5cbi8vSW50ZXJsZWF2ZSBiaXRzIG9mIDIgY29vcmRpbmF0ZXMgd2l0aCAxNiBiaXRzLiAgVXNlZnVsIGZvciBmYXN0IHF1YWR0cmVlIGNvZGVzXG5leHBvcnRzLmludGVybGVhdmUyID0gZnVuY3Rpb24oeCwgeSkge1xuICB4ICY9IDB4RkZGRjtcbiAgeCA9ICh4IHwgKHggPDwgOCkpICYgMHgwMEZGMDBGRjtcbiAgeCA9ICh4IHwgKHggPDwgNCkpICYgMHgwRjBGMEYwRjtcbiAgeCA9ICh4IHwgKHggPDwgMikpICYgMHgzMzMzMzMzMztcbiAgeCA9ICh4IHwgKHggPDwgMSkpICYgMHg1NTU1NTU1NTtcblxuICB5ICY9IDB4RkZGRjtcbiAgeSA9ICh5IHwgKHkgPDwgOCkpICYgMHgwMEZGMDBGRjtcbiAgeSA9ICh5IHwgKHkgPDwgNCkpICYgMHgwRjBGMEYwRjtcbiAgeSA9ICh5IHwgKHkgPDwgMikpICYgMHgzMzMzMzMzMztcbiAgeSA9ICh5IHwgKHkgPDwgMSkpICYgMHg1NTU1NTU1NTtcblxuICByZXR1cm4geCB8ICh5IDw8IDEpO1xufVxuXG4vL0V4dHJhY3RzIHRoZSBudGggaW50ZXJsZWF2ZWQgY29tcG9uZW50XG5leHBvcnRzLmRlaW50ZXJsZWF2ZTIgPSBmdW5jdGlvbih2LCBuKSB7XG4gIHYgPSAodiA+Pj4gbikgJiAweDU1NTU1NTU1O1xuICB2ID0gKHYgfCAodiA+Pj4gMSkpICAmIDB4MzMzMzMzMzM7XG4gIHYgPSAodiB8ICh2ID4+PiAyKSkgICYgMHgwRjBGMEYwRjtcbiAgdiA9ICh2IHwgKHYgPj4+IDQpKSAgJiAweDAwRkYwMEZGO1xuICB2ID0gKHYgfCAodiA+Pj4gMTYpKSAmIDB4MDAwRkZGRjtcbiAgcmV0dXJuICh2IDw8IDE2KSA+PiAxNjtcbn1cblxuXG4vL0ludGVybGVhdmUgYml0cyBvZiAzIGNvb3JkaW5hdGVzLCBlYWNoIHdpdGggMTAgYml0cy4gIFVzZWZ1bCBmb3IgZmFzdCBvY3RyZWUgY29kZXNcbmV4cG9ydHMuaW50ZXJsZWF2ZTMgPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gIHggJj0gMHgzRkY7XG4gIHggID0gKHggfCAoeDw8MTYpKSAmIDQyNzgxOTAzMzU7XG4gIHggID0gKHggfCAoeDw8OCkpICAmIDI1MTcxOTY5NTtcbiAgeCAgPSAoeCB8ICh4PDw0KSkgICYgMzI3MjM1NjAzNTtcbiAgeCAgPSAoeCB8ICh4PDwyKSkgICYgMTIyNzEzMzUxMztcblxuICB5ICY9IDB4M0ZGO1xuICB5ICA9ICh5IHwgKHk8PDE2KSkgJiA0Mjc4MTkwMzM1O1xuICB5ICA9ICh5IHwgKHk8PDgpKSAgJiAyNTE3MTk2OTU7XG4gIHkgID0gKHkgfCAoeTw8NCkpICAmIDMyNzIzNTYwMzU7XG4gIHkgID0gKHkgfCAoeTw8MikpICAmIDEyMjcxMzM1MTM7XG4gIHggfD0gKHkgPDwgMSk7XG4gIFxuICB6ICY9IDB4M0ZGO1xuICB6ICA9ICh6IHwgKHo8PDE2KSkgJiA0Mjc4MTkwMzM1O1xuICB6ICA9ICh6IHwgKHo8PDgpKSAgJiAyNTE3MTk2OTU7XG4gIHogID0gKHogfCAoejw8NCkpICAmIDMyNzIzNTYwMzU7XG4gIHogID0gKHogfCAoejw8MikpICAmIDEyMjcxMzM1MTM7XG4gIFxuICByZXR1cm4geCB8ICh6IDw8IDIpO1xufVxuXG4vL0V4dHJhY3RzIG50aCBpbnRlcmxlYXZlZCBjb21wb25lbnQgb2YgYSAzLXR1cGxlXG5leHBvcnRzLmRlaW50ZXJsZWF2ZTMgPSBmdW5jdGlvbih2LCBuKSB7XG4gIHYgPSAodiA+Pj4gbikgICAgICAgJiAxMjI3MTMzNTEzO1xuICB2ID0gKHYgfCAodj4+PjIpKSAgICYgMzI3MjM1NjAzNTtcbiAgdiA9ICh2IHwgKHY+Pj40KSkgICAmIDI1MTcxOTY5NTtcbiAgdiA9ICh2IHwgKHY+Pj44KSkgICAmIDQyNzgxOTAzMzU7XG4gIHYgPSAodiB8ICh2Pj4+MTYpKSAgJiAweDNGRjtcbiAgcmV0dXJuICh2PDwyMik+PjIyO1xufVxuXG4vL0NvbXB1dGVzIG5leHQgY29tYmluYXRpb24gaW4gY29sZXhpY29ncmFwaGljIG9yZGVyICh0aGlzIGlzIG1pc3Rha2VubHkgY2FsbGVkIG5leHRQZXJtdXRhdGlvbiBvbiB0aGUgYml0IHR3aWRkbGluZyBoYWNrcyBwYWdlKVxuZXhwb3J0cy5uZXh0Q29tYmluYXRpb24gPSBmdW5jdGlvbih2KSB7XG4gIHZhciB0ID0gdiB8ICh2IC0gMSk7XG4gIHJldHVybiAodCArIDEpIHwgKCgofnQgJiAtfnQpIC0gMSkgPj4+IChjb3VudFRyYWlsaW5nWmVyb3ModikgKyAxKSk7XG59XG5cbiIsIlwidXNlIHN0cmljdFwiOyBcInVzZSByZXN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFVuaW9uRmluZDtcblxuZnVuY3Rpb24gVW5pb25GaW5kKGNvdW50KSB7XG4gIHRoaXMucm9vdHMgPSBuZXcgQXJyYXkoY291bnQpO1xuICB0aGlzLnJhbmtzID0gbmV3IEFycmF5KGNvdW50KTtcbiAgXG4gIGZvcih2YXIgaT0wOyBpPGNvdW50OyArK2kpIHtcbiAgICB0aGlzLnJvb3RzW2ldID0gaTtcbiAgICB0aGlzLnJhbmtzW2ldID0gMDtcbiAgfVxufVxuXG5VbmlvbkZpbmQucHJvdG90eXBlLmxlbmd0aCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5yb290cy5sZW5ndGg7XG59XG5cblVuaW9uRmluZC5wcm90b3R5cGUubWFrZVNldCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgbiA9IHRoaXMucm9vdHMubGVuZ3RoO1xuICB0aGlzLnJvb3RzLnB1c2gobik7XG4gIHRoaXMucmFua3MucHVzaCgwKTtcbiAgcmV0dXJuIG47XG59XG5cblVuaW9uRmluZC5wcm90b3R5cGUuZmluZCA9IGZ1bmN0aW9uKHgpIHtcbiAgdmFyIHJvb3RzID0gdGhpcy5yb290cztcbiAgd2hpbGUocm9vdHNbeF0gIT09IHgpIHtcbiAgICB2YXIgeSA9IHJvb3RzW3hdO1xuICAgIHJvb3RzW3hdID0gcm9vdHNbeV07XG4gICAgeCA9IHk7XG4gIH1cbiAgcmV0dXJuIHg7XG59XG5cblVuaW9uRmluZC5wcm90b3R5cGUubGluayA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIHhyID0gdGhpcy5maW5kKHgpXG4gICAgLCB5ciA9IHRoaXMuZmluZCh5KTtcbiAgaWYoeHIgPT09IHlyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciByYW5rcyA9IHRoaXMucmFua3NcbiAgICAsIHJvb3RzID0gdGhpcy5yb290c1xuICAgICwgeGQgICAgPSByYW5rc1t4cl1cbiAgICAsIHlkICAgID0gcmFua3NbeXJdO1xuICBpZih4ZCA8IHlkKSB7XG4gICAgcm9vdHNbeHJdID0geXI7XG4gIH0gZWxzZSBpZih5ZCA8IHhkKSB7XG4gICAgcm9vdHNbeXJdID0geHI7XG4gIH0gZWxzZSB7XG4gICAgcm9vdHNbeXJdID0geHI7XG4gICAgKytyYW5rc1t4cl07XG4gIH1cbn1cblxuIiwiXCJ1c2Ugc3RyaWN0XCI7IFwidXNlIHJlc3RyaWN0XCI7XG5cbnZhciBiaXRzICAgICAgPSByZXF1aXJlKFwiYml0LXR3aWRkbGVcIilcbiAgLCBVbmlvbkZpbmQgPSByZXF1aXJlKFwidW5pb24tZmluZFwiKVxuXG4vL1JldHVybnMgdGhlIGRpbWVuc2lvbiBvZiBhIGNlbGwgY29tcGxleFxuZnVuY3Rpb24gZGltZW5zaW9uKGNlbGxzKSB7XG4gIHZhciBkID0gMFxuICAgICwgbWF4ID0gTWF0aC5tYXhcbiAgZm9yKHZhciBpPTAsIGlsPWNlbGxzLmxlbmd0aDsgaTxpbDsgKytpKSB7XG4gICAgZCA9IG1heChkLCBjZWxsc1tpXS5sZW5ndGgpXG4gIH1cbiAgcmV0dXJuIGQtMVxufVxuZXhwb3J0cy5kaW1lbnNpb24gPSBkaW1lbnNpb25cblxuLy9Db3VudHMgdGhlIG51bWJlciBvZiB2ZXJ0aWNlcyBpbiBmYWNlc1xuZnVuY3Rpb24gY291bnRWZXJ0aWNlcyhjZWxscykge1xuICB2YXIgdmMgPSAtMVxuICAgICwgbWF4ID0gTWF0aC5tYXhcbiAgZm9yKHZhciBpPTAsIGlsPWNlbGxzLmxlbmd0aDsgaTxpbDsgKytpKSB7XG4gICAgdmFyIGMgPSBjZWxsc1tpXVxuICAgIGZvcih2YXIgaj0wLCBqbD1jLmxlbmd0aDsgajxqbDsgKytqKSB7XG4gICAgICB2YyA9IG1heCh2YywgY1tqXSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHZjKzFcbn1cbmV4cG9ydHMuY291bnRWZXJ0aWNlcyA9IGNvdW50VmVydGljZXNcblxuLy9SZXR1cm5zIGEgZGVlcCBjb3B5IG9mIGNlbGxzXG5mdW5jdGlvbiBjbG9uZUNlbGxzKGNlbGxzKSB7XG4gIHZhciBuY2VsbHMgPSBuZXcgQXJyYXkoY2VsbHMubGVuZ3RoKVxuICBmb3IodmFyIGk9MCwgaWw9Y2VsbHMubGVuZ3RoOyBpPGlsOyArK2kpIHtcbiAgICBuY2VsbHNbaV0gPSBjZWxsc1tpXS5zbGljZSgwKVxuICB9XG4gIHJldHVybiBuY2VsbHNcbn1cbmV4cG9ydHMuY2xvbmVDZWxscyA9IGNsb25lQ2VsbHNcblxuLy9SYW5rcyBhIHBhaXIgb2YgY2VsbHMgdXAgdG8gcGVybXV0YXRpb25cbmZ1bmN0aW9uIGNvbXBhcmVDZWxscyhhLCBiKSB7XG4gIHZhciBuID0gYS5sZW5ndGhcbiAgICAsIHQgPSBhLmxlbmd0aCAtIGIubGVuZ3RoXG4gICAgLCBtaW4gPSBNYXRoLm1pblxuICBpZih0KSB7XG4gICAgcmV0dXJuIHRcbiAgfVxuICBzd2l0Y2gobikge1xuICAgIGNhc2UgMDpcbiAgICAgIHJldHVybiAwO1xuICAgIGNhc2UgMTpcbiAgICAgIHJldHVybiBhWzBdIC0gYlswXTtcbiAgICBjYXNlIDI6XG4gICAgICB2YXIgZCA9IGFbMF0rYVsxXS1iWzBdLWJbMV1cbiAgICAgIGlmKGQpIHtcbiAgICAgICAgcmV0dXJuIGRcbiAgICAgIH1cbiAgICAgIHJldHVybiBtaW4oYVswXSxhWzFdKSAtIG1pbihiWzBdLGJbMV0pXG4gICAgY2FzZSAzOlxuICAgICAgdmFyIGwxID0gYVswXSthWzFdXG4gICAgICAgICwgbTEgPSBiWzBdK2JbMV1cbiAgICAgIGQgPSBsMSthWzJdIC0gKG0xK2JbMl0pXG4gICAgICBpZihkKSB7XG4gICAgICAgIHJldHVybiBkXG4gICAgICB9XG4gICAgICB2YXIgbDAgPSBtaW4oYVswXSwgYVsxXSlcbiAgICAgICAgLCBtMCA9IG1pbihiWzBdLCBiWzFdKVxuICAgICAgICAsIGQgID0gbWluKGwwLCBhWzJdKSAtIG1pbihtMCwgYlsyXSlcbiAgICAgIGlmKGQpIHtcbiAgICAgICAgcmV0dXJuIGRcbiAgICAgIH1cbiAgICAgIHJldHVybiBtaW4obDArYVsyXSwgbDEpIC0gbWluKG0wK2JbMl0sIG0xKVxuICAgIFxuICAgIC8vVE9ETzogTWF5YmUgb3B0aW1pemUgbj00IGFzIHdlbGw/XG4gICAgXG4gICAgZGVmYXVsdDpcbiAgICAgIHZhciBhcyA9IGEuc2xpY2UoMClcbiAgICAgIGFzLnNvcnQoKVxuICAgICAgdmFyIGJzID0gYi5zbGljZSgwKVxuICAgICAgYnMuc29ydCgpXG4gICAgICBmb3IodmFyIGk9MDsgaTxuOyArK2kpIHtcbiAgICAgICAgdCA9IGFzW2ldIC0gYnNbaV1cbiAgICAgICAgaWYodCkge1xuICAgICAgICAgIHJldHVybiB0XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiAwXG4gIH1cbn1cbmV4cG9ydHMuY29tcGFyZUNlbGxzID0gY29tcGFyZUNlbGxzXG5cbmZ1bmN0aW9uIGNvbXBhcmVaaXBwZWQoYSwgYikge1xuICByZXR1cm4gY29tcGFyZUNlbGxzKGFbMF0sIGJbMF0pXG59XG5cbi8vUHV0cyBhIGNlbGwgY29tcGxleCBpbnRvIG5vcm1hbCBvcmRlciBmb3IgdGhlIHB1cnBvc2VzIG9mIGZpbmRDZWxsIHF1ZXJpZXNcbmZ1bmN0aW9uIG5vcm1hbGl6ZShjZWxscywgYXR0cikge1xuICBpZihhdHRyKSB7XG4gICAgdmFyIGxlbiA9IGNlbGxzLmxlbmd0aFxuICAgIHZhciB6aXBwZWQgPSBuZXcgQXJyYXkobGVuKVxuICAgIGZvcih2YXIgaT0wOyBpPGxlbjsgKytpKSB7XG4gICAgICB6aXBwZWRbaV0gPSBbY2VsbHNbaV0sIGF0dHJbaV1dXG4gICAgfVxuICAgIHppcHBlZC5zb3J0KGNvbXBhcmVaaXBwZWQpXG4gICAgZm9yKHZhciBpPTA7IGk8bGVuOyArK2kpIHtcbiAgICAgIGNlbGxzW2ldID0gemlwcGVkW2ldWzBdXG4gICAgICBhdHRyW2ldID0gemlwcGVkW2ldWzFdXG4gICAgfVxuICAgIHJldHVybiBjZWxsc1xuICB9IGVsc2Uge1xuICAgIGNlbGxzLnNvcnQoY29tcGFyZUNlbGxzKVxuICAgIHJldHVybiBjZWxsc1xuICB9XG59XG5leHBvcnRzLm5vcm1hbGl6ZSA9IG5vcm1hbGl6ZVxuXG4vL1JlbW92ZXMgYWxsIGR1cGxpY2F0ZSBjZWxscyBpbiB0aGUgY29tcGxleFxuZnVuY3Rpb24gdW5pcXVlKGNlbGxzKSB7XG4gIGlmKGNlbGxzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXVxuICB9XG4gIHZhciBwdHIgPSAxXG4gICAgLCBsZW4gPSBjZWxscy5sZW5ndGhcbiAgZm9yKHZhciBpPTE7IGk8bGVuOyArK2kpIHtcbiAgICB2YXIgYSA9IGNlbGxzW2ldXG4gICAgaWYoY29tcGFyZUNlbGxzKGEsIGNlbGxzW2ktMV0pKSB7XG4gICAgICBpZihpID09PSBwdHIpIHtcbiAgICAgICAgcHRyKytcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNlbGxzW3B0cisrXSA9IGFcbiAgICB9XG4gIH1cbiAgY2VsbHMubGVuZ3RoID0gcHRyXG4gIHJldHVybiBjZWxsc1xufVxuZXhwb3J0cy51bmlxdWUgPSB1bmlxdWU7XG5cbi8vRmluZHMgYSBjZWxsIGluIGEgbm9ybWFsaXplZCBjZWxsIGNvbXBsZXhcbmZ1bmN0aW9uIGZpbmRDZWxsKGNlbGxzLCBjKSB7XG4gIHZhciBsbyA9IDBcbiAgICAsIGhpID0gY2VsbHMubGVuZ3RoLTFcbiAgICAsIHIgID0gLTFcbiAgd2hpbGUgKGxvIDw9IGhpKSB7XG4gICAgdmFyIG1pZCA9IChsbyArIGhpKSA+PiAxXG4gICAgICAsIHMgICA9IGNvbXBhcmVDZWxscyhjZWxsc1ttaWRdLCBjKVxuICAgIGlmKHMgPD0gMCkge1xuICAgICAgaWYocyA9PT0gMCkge1xuICAgICAgICByID0gbWlkXG4gICAgICB9XG4gICAgICBsbyA9IG1pZCArIDFcbiAgICB9IGVsc2UgaWYocyA+IDApIHtcbiAgICAgIGhpID0gbWlkIC0gMVxuICAgIH1cbiAgfVxuICByZXR1cm4gclxufVxuZXhwb3J0cy5maW5kQ2VsbCA9IGZpbmRDZWxsO1xuXG4vL0J1aWxkcyBhbiBpbmRleCBmb3IgYW4gbi1jZWxsLiAgVGhpcyBpcyBtb3JlIGdlbmVyYWwgdGhhbiBkdWFsLCBidXQgbGVzcyBlZmZpY2llbnRcbmZ1bmN0aW9uIGluY2lkZW5jZShmcm9tX2NlbGxzLCB0b19jZWxscykge1xuICB2YXIgaW5kZXggPSBuZXcgQXJyYXkoZnJvbV9jZWxscy5sZW5ndGgpXG4gIGZvcih2YXIgaT0wLCBpbD1pbmRleC5sZW5ndGg7IGk8aWw7ICsraSkge1xuICAgIGluZGV4W2ldID0gW11cbiAgfVxuICB2YXIgYiA9IFtdXG4gIGZvcih2YXIgaT0wLCBuPXRvX2NlbGxzLmxlbmd0aDsgaTxuOyArK2kpIHtcbiAgICB2YXIgYyA9IHRvX2NlbGxzW2ldXG4gICAgdmFyIGNsID0gYy5sZW5ndGhcbiAgICBmb3IodmFyIGs9MSwga249KDE8PGNsKTsgazxrbjsgKytrKSB7XG4gICAgICBiLmxlbmd0aCA9IGJpdHMucG9wQ291bnQoaylcbiAgICAgIHZhciBsID0gMFxuICAgICAgZm9yKHZhciBqPTA7IGo8Y2w7ICsraikge1xuICAgICAgICBpZihrICYgKDE8PGopKSB7XG4gICAgICAgICAgYltsKytdID0gY1tqXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaWR4PWZpbmRDZWxsKGZyb21fY2VsbHMsIGIpXG4gICAgICBpZihpZHggPCAwKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICB3aGlsZSh0cnVlKSB7XG4gICAgICAgIGluZGV4W2lkeCsrXS5wdXNoKGkpXG4gICAgICAgIGlmKGlkeCA+PSBmcm9tX2NlbGxzLmxlbmd0aCB8fCBjb21wYXJlQ2VsbHMoZnJvbV9jZWxsc1tpZHhdLCBiKSAhPT0gMCkge1xuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGluZGV4XG59XG5leHBvcnRzLmluY2lkZW5jZSA9IGluY2lkZW5jZVxuXG4vL0NvbXB1dGVzIHRoZSBkdWFsIG9mIHRoZSBtZXNoLiAgVGhpcyBpcyBiYXNpY2FsbHkgYW4gb3B0aW1pemVkIHZlcnNpb24gb2YgYnVpbGRJbmRleCBmb3IgdGhlIHNpdHVhdGlvbiB3aGVyZSBmcm9tX2NlbGxzIGlzIGp1c3QgdGhlIGxpc3Qgb2YgdmVydGljZXNcbmZ1bmN0aW9uIGR1YWwoY2VsbHMsIHZlcnRleF9jb3VudCkge1xuICBpZighdmVydGV4X2NvdW50KSB7XG4gICAgcmV0dXJuIGluY2lkZW5jZSh1bmlxdWUoc2tlbGV0b24oY2VsbHMsIDApKSwgY2VsbHMsIDApXG4gIH1cbiAgdmFyIHJlcyA9IG5ldyBBcnJheSh2ZXJ0ZXhfY291bnQpXG4gIGZvcih2YXIgaT0wOyBpPHZlcnRleF9jb3VudDsgKytpKSB7XG4gICAgcmVzW2ldID0gW11cbiAgfVxuICBmb3IodmFyIGk9MCwgbGVuPWNlbGxzLmxlbmd0aDsgaTxsZW47ICsraSkge1xuICAgIHZhciBjID0gY2VsbHNbaV1cbiAgICBmb3IodmFyIGo9MCwgY2w9Yy5sZW5ndGg7IGo8Y2w7ICsraikge1xuICAgICAgcmVzW2Nbal1dLnB1c2goaSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuZXhwb3J0cy5kdWFsID0gZHVhbFxuXG4vL0VudW1lcmF0ZXMgYWxsIGNlbGxzIGluIHRoZSBjb21wbGV4XG5mdW5jdGlvbiBleHBsb2RlKGNlbGxzKSB7XG4gIHZhciByZXN1bHQgPSBbXVxuICBmb3IodmFyIGk9MCwgaWw9Y2VsbHMubGVuZ3RoOyBpPGlsOyArK2kpIHtcbiAgICB2YXIgYyA9IGNlbGxzW2ldXG4gICAgICAsIGNsID0gYy5sZW5ndGh8MFxuICAgIGZvcih2YXIgaj0xLCBqbD0oMTw8Y2wpOyBqPGpsOyArK2opIHtcbiAgICAgIHZhciBiID0gW11cbiAgICAgIGZvcih2YXIgaz0wOyBrPGNsOyArK2spIHtcbiAgICAgICAgaWYoKGogPj4+IGspICYgMSkge1xuICAgICAgICAgIGIucHVzaChjW2tdKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXN1bHQucHVzaChiKVxuICAgIH1cbiAgfVxuICByZXR1cm4gbm9ybWFsaXplKHJlc3VsdClcbn1cbmV4cG9ydHMuZXhwbG9kZSA9IGV4cGxvZGVcblxuLy9FbnVtZXJhdGVzIGFsbCBvZiB0aGUgbi1jZWxscyBvZiBhIGNlbGwgY29tcGxleFxuZnVuY3Rpb24gc2tlbGV0b24oY2VsbHMsIG4pIHtcbiAgaWYobiA8IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuICB2YXIgcmVzdWx0ID0gW11cbiAgICAsIGswICAgICA9ICgxPDwobisxKSktMVxuICBmb3IodmFyIGk9MDsgaTxjZWxscy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjID0gY2VsbHNbaV1cbiAgICBmb3IodmFyIGs9azA7IGs8KDE8PGMubGVuZ3RoKTsgaz1iaXRzLm5leHRDb21iaW5hdGlvbihrKSkge1xuICAgICAgdmFyIGIgPSBuZXcgQXJyYXkobisxKVxuICAgICAgICAsIGwgPSAwXG4gICAgICBmb3IodmFyIGo9MDsgajxjLmxlbmd0aDsgKytqKSB7XG4gICAgICAgIGlmKGsgJiAoMTw8aikpIHtcbiAgICAgICAgICBiW2wrK10gPSBjW2pdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wdXNoKGIpXG4gICAgfVxuICB9XG4gIHJldHVybiBub3JtYWxpemUocmVzdWx0KVxufVxuZXhwb3J0cy5za2VsZXRvbiA9IHNrZWxldG9uO1xuXG4vL0NvbXB1dGVzIHRoZSBib3VuZGFyeSBvZiBhbGwgY2VsbHMsIGRvZXMgbm90IHJlbW92ZSBkdXBsaWNhdGVzXG5mdW5jdGlvbiBib3VuZGFyeShjZWxscykge1xuICB2YXIgcmVzID0gW11cbiAgZm9yKHZhciBpPTAsaWw9Y2VsbHMubGVuZ3RoOyBpPGlsOyArK2kpIHtcbiAgICB2YXIgYyA9IGNlbGxzW2ldXG4gICAgZm9yKHZhciBqPTAsY2w9Yy5sZW5ndGg7IGo8Y2w7ICsraikge1xuICAgICAgdmFyIGIgPSBuZXcgQXJyYXkoYy5sZW5ndGgtMSlcbiAgICAgIGZvcih2YXIgaz0wLCBsPTA7IGs8Y2w7ICsraykge1xuICAgICAgICBpZihrICE9PSBqKSB7XG4gICAgICAgICAgYltsKytdID0gY1trXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXMucHVzaChiKVxuICAgIH1cbiAgfVxuICByZXR1cm4gbm9ybWFsaXplKHJlcylcbn1cbmV4cG9ydHMuYm91bmRhcnkgPSBib3VuZGFyeTtcblxuLy9Db21wdXRlcyBjb25uZWN0ZWQgY29tcG9uZW50cyBmb3IgYSBkZW5zZSBjZWxsIGNvbXBsZXhcbmZ1bmN0aW9uIGNvbm5lY3RlZENvbXBvbmVudHNfZGVuc2UoY2VsbHMsIHZlcnRleF9jb3VudCkge1xuICB2YXIgbGFiZWxzID0gbmV3IFVuaW9uRmluZCh2ZXJ0ZXhfY291bnQpXG4gIGZvcih2YXIgaT0wOyBpPGNlbGxzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGMgPSBjZWxsc1tpXVxuICAgIGZvcih2YXIgaj0wOyBqPGMubGVuZ3RoOyArK2opIHtcbiAgICAgIGZvcih2YXIgaz1qKzE7IGs8Yy5sZW5ndGg7ICsraykge1xuICAgICAgICBsYWJlbHMubGluayhjW2pdLCBjW2tdKVxuICAgICAgfVxuICAgIH1cbiAgfVxuICB2YXIgY29tcG9uZW50cyA9IFtdXG4gICAgLCBjb21wb25lbnRfbGFiZWxzID0gbGFiZWxzLnJhbmtzXG4gIGZvcih2YXIgaT0wOyBpPGNvbXBvbmVudF9sYWJlbHMubGVuZ3RoOyArK2kpIHtcbiAgICBjb21wb25lbnRfbGFiZWxzW2ldID0gLTFcbiAgfVxuICBmb3IodmFyIGk9MDsgaTxjZWxscy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBsID0gbGFiZWxzLmZpbmQoY2VsbHNbaV1bMF0pXG4gICAgaWYoY29tcG9uZW50X2xhYmVsc1tsXSA8IDApIHtcbiAgICAgIGNvbXBvbmVudF9sYWJlbHNbbF0gPSBjb21wb25lbnRzLmxlbmd0aFxuICAgICAgY29tcG9uZW50cy5wdXNoKFtjZWxsc1tpXS5zbGljZSgwKV0pXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbXBvbmVudHNbY29tcG9uZW50X2xhYmVsc1tsXV0ucHVzaChjZWxsc1tpXS5zbGljZSgwKSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbXBvbmVudHNcbn1cblxuLy9Db21wdXRlcyBjb25uZWN0ZWQgY29tcG9uZW50cyBmb3IgYSBzcGFyc2UgZ3JhcGhcbmZ1bmN0aW9uIGNvbm5lY3RlZENvbXBvbmVudHNfc3BhcnNlKGNlbGxzKSB7XG4gIHZhciB2ZXJ0aWNlcyAgPSB1bmlxdWUobm9ybWFsaXplKHNrZWxldG9uKGNlbGxzLCAwKSkpXG4gICAgLCBsYWJlbHMgICAgPSBuZXcgVW5pb25GaW5kKHZlcnRpY2VzLmxlbmd0aClcbiAgZm9yKHZhciBpPTA7IGk8Y2VsbHMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgYyA9IGNlbGxzW2ldXG4gICAgZm9yKHZhciBqPTA7IGo8Yy5sZW5ndGg7ICsraikge1xuICAgICAgdmFyIHZqID0gZmluZENlbGwodmVydGljZXMsIFtjW2pdXSlcbiAgICAgIGZvcih2YXIgaz1qKzE7IGs8Yy5sZW5ndGg7ICsraykge1xuICAgICAgICBsYWJlbHMubGluayh2aiwgZmluZENlbGwodmVydGljZXMsIFtjW2tdXSkpXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHZhciBjb21wb25lbnRzICAgICAgICA9IFtdXG4gICAgLCBjb21wb25lbnRfbGFiZWxzICA9IGxhYmVscy5yYW5rc1xuICBmb3IodmFyIGk9MDsgaTxjb21wb25lbnRfbGFiZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgY29tcG9uZW50X2xhYmVsc1tpXSA9IC0xXG4gIH1cbiAgZm9yKHZhciBpPTA7IGk8Y2VsbHMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbCA9IGxhYmVscy5maW5kKGZpbmRDZWxsKHZlcnRpY2VzLCBbY2VsbHNbaV1bMF1dKSk7XG4gICAgaWYoY29tcG9uZW50X2xhYmVsc1tsXSA8IDApIHtcbiAgICAgIGNvbXBvbmVudF9sYWJlbHNbbF0gPSBjb21wb25lbnRzLmxlbmd0aFxuICAgICAgY29tcG9uZW50cy5wdXNoKFtjZWxsc1tpXS5zbGljZSgwKV0pXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbXBvbmVudHNbY29tcG9uZW50X2xhYmVsc1tsXV0ucHVzaChjZWxsc1tpXS5zbGljZSgwKSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbXBvbmVudHNcbn1cblxuLy9Db21wdXRlcyBjb25uZWN0ZWQgY29tcG9uZW50cyBmb3IgYSBjZWxsIGNvbXBsZXhcbmZ1bmN0aW9uIGNvbm5lY3RlZENvbXBvbmVudHMoY2VsbHMsIHZlcnRleF9jb3VudCkge1xuICBpZih2ZXJ0ZXhfY291bnQpIHtcbiAgICByZXR1cm4gY29ubmVjdGVkQ29tcG9uZW50c19kZW5zZShjZWxscywgdmVydGV4X2NvdW50KVxuICB9XG4gIHJldHVybiBjb25uZWN0ZWRDb21wb25lbnRzX3NwYXJzZShjZWxscylcbn1cbmV4cG9ydHMuY29ubmVjdGVkQ29tcG9uZW50cyA9IGNvbm5lY3RlZENvbXBvbmVudHNcbiIsIlwidXNlIHN0cmljdFwiXG5cbnZhciBjcmVhdGVUcmlhbmd1bGF0aW9uID0gcmVxdWlyZShcImluY3JlbWVudGFsLWRlbGF1bmF5XCIpXG52YXIgc2MgPSByZXF1aXJlKFwic2ltcGxpY2lhbC1jb21wbGV4XCIpXG5cbm1vZHVsZS5leHBvcnRzID0gdHJpYW5ndWxhdGVcblxuZnVuY3Rpb24gdHJpYW5ndWxhdGUocG9pbnRzKSB7XG4gIGlmKHBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuICB2YXIgZGltZW5zaW9uID0gcG9pbnRzWzBdLmxlbmd0aFxuICB2YXIgdHJpYW5ndWxhdGlvbiA9IGNyZWF0ZVRyaWFuZ3VsYXRpb24oZGltZW5zaW9uKVxuICBmb3IodmFyIGk9MDsgaTxwb2ludHMubGVuZ3RoOyArK2kpIHtcbiAgICB0cmlhbmd1bGF0aW9uLmluc2VydChwb2ludHNbaV0pXG4gIH1cbiAgdmFyIGNlbGxzID0gW11cbm91dGVyX2xvb3A6XG4gIGZvcih2YXIgY3VyPXRyaWFuZ3VsYXRpb24ucHJldjsgY3VyIT09dHJpYW5ndWxhdGlvbjsgY3VyPWN1ci5wcmV2KSB7XG4gICAgdmFyIHYgPSBjdXIudmVydGljZXNcbiAgICBmb3IodmFyIGk9MDsgaTx2Lmxlbmd0aDsgKytpKSB7XG4gICAgICBpZih2W2ldIDw9IGRpbWVuc2lvbikge1xuICAgICAgICBjb250aW51ZSBvdXRlcl9sb29wXG4gICAgICB9XG4gICAgICB2W2ldIC09IGRpbWVuc2lvbiArIDFcbiAgICB9XG4gICAgY2VsbHMucHVzaCh2KVxuICB9XG4gIHJldHVybiBzYy5ub3JtYWxpemUoY2VsbHMpXG59IiwiLy8gc2V0IHVwIHRoZSBjYW52YXMgYW5kIGdyYXBoaWNzXHJcbnZhciBjYW52YXNFbGVtZW50ID0gcmVxdWlyZShcIi4vc2V0dXBjYW52YXMuanNcIik7XHJcbnZhciB3aWR0aCA9IGNhbnZhc0VsZW1lbnQud2lkdGg7IHZhciBoZWlnaHQgPSBjYW52YXNFbGVtZW50LmhlaWdodDtcclxudmFyIGdjID0gY2FudmFzRWxlbWVudC5nZXRDb250ZXh0KFwiMmRcIik7XHJcblxyXG52YXIgbiA9IDUwO1xyXG52YXIgcm9ib3RSYWRpdXMgPSAxMDtcclxudmFyIGZvbnQgPSBcIjEycHggQXJpYWxcIjtcclxudmFyIGR0ID0gMzA7XHJcbnZhciBkaXN0YW5jZVBlclRpbWVTdGVwID0gMTAwMC81KmR0LzEwMDAgKiAwLjU7XHJcbnZhciBwYXRoID0gbmV3IEFycmF5KCk7XHJcbnZhciBzaG93UGF0aHMgPSB0cnVlO1xyXG52YXIgcnVuU2ltdWxhdGlvbiA9IGZhbHNlO1xyXG52YXIgc3RlcHMgPSAwO1xyXG52YXIgc2ltdWxhdGlvbkZpbmlzaGVkID0gZmFsc2U7XHJcbnZhciBhbGdvcml0aG0gPSBcImluIG9yZGVyXCI7XHJcbnZhciBzaG93RGVsYXVuYXlFZGdlcyA9IGZhbHNlO1xyXG5cclxuLy8gYW5pbWF0aW9uIGVmZmVjdFxyXG5zZXRJbnRlcnZhbChmdW5jdGlvbigpIHt1cGRhdGVTaW11bGF0aW9uKCl9LCBkdCk7XHJcbmZ1bmN0aW9uIHVwZGF0ZVNpbXVsYXRpb24oKSB7XHJcblx0Ly8gaXMgdGhlIHNpbXVsYXRpb24gZmluaXNoZWRcclxuXHRzaW11bGF0aW9uRmluaXNoZWQgPSB0cnVlO1xyXG5cdGZvciAoaSA9IDA7IGk8bjsgaSsrKSB7XHJcblx0XHRpZiAocm9ib3RbaV0uc3RhdHVzID09IFwiYXdha2VcIikge1xyXG5cdFx0XHRzaW11bGF0aW9uRmluaXNoZWQgPSBmYWxzZTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHR9XHJcblx0fVxyXG5cdFxyXG5cdC8vIGJ1dHRvbnMgY2FuIGFsc28gcGF1c2UgdGhlIHNpbXVsYXRpb25cclxuXHRpZiAoc2ltdWxhdGlvbkZpbmlzaGVkID09IHRydWUpIHtcclxuXHRcdHJ1blNpbXVsYXRpb24gPSBmYWxzZTtcclxuXHR9XHJcblx0XHJcblx0Ly8gYWR2YW5jZSB0aGUgc2ltdWxhdGlvblxyXG5cdGlmIChydW5TaW11bGF0aW9uID09IHRydWUpIHtcclxuXHRcdHVwZGF0ZVBvc2l0aW9uVGFrZTIoKTtcclxuXHRcdHN0ZXBzICs9MTtcclxuXHR9XHJcblx0XHJcblx0Ly8gdXBkYXRlIHRoZSBjYW52YXMgLyBodG1sXHJcblx0c3RlcEJ1dHRvbi5pbm5lckhUTUwgID0gXCJTdGVwID0gXCIgKyBzdGVwcztcclxuXHRkcmF3KCk7XHJcbn1cclxuXHJcblxyXG4vLyBkcmF3cyBvbiB0aGUgY2FudmFzXHJcbmZ1bmN0aW9uIGRyYXcoKSB7XHJcblx0XHJcblx0Ly8gY2xlYXIgdGhlIGNhbnZhcyAtIChjb2xvciB0aGUgZW50aXJlIGNhbnZhcyByZWQpXHJcblx0Z2MuZmlsbFN0eWxlID0gXCJyZ2IoMjU1LCAxMTAsIDExMClcIjtcclxuXHRnYy5maWxsUmVjdCgwLCAwLCBjYW52YXNFbGVtZW50LndpZHRoLCBjYW52YXNFbGVtZW50LmhlaWdodCk7XHRcclxuXHJcblx0Ly8gZGVsYXVuYXkgZWRnZXNcclxuXHRpZiAoc2hvd0RlbGF1bmF5RWRnZXMgPT0gdHJ1ZSkge1xyXG5cdFx0Z2Muc3Ryb2tlU3R5bGUgPSBcIiNmZmZmZmZcIjtcclxuXHRcdGdjLmxpbmVXaWR0aCA9IFwiMVwiO1xyXG5cdFx0Zm9yIChpID0gMDsgaSA8IGVkZ2VzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdGdjLmJlZ2luUGF0aCgpO1xyXG5cdFx0XHRnYy5tb3ZlVG8oZWRnZXNbaV1bMF0sIGVkZ2VzW2ldWzFdKTtcclxuXHRcdFx0Z2MubGluZVRvKGVkZ2VzW2ldWzJdLCBlZGdlc1tpXVszXSk7XHJcblx0XHRcdGdjLnN0cm9rZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRcclxuXHQvLyBkcmF3IHRoZSBwYXRoc1xyXG5cdGlmIChzaG93UGF0aHMgPT0gdHJ1ZSkge1xyXG5cdFx0Z2Muc3Ryb2tlU3R5bGUgPSBcIiNmZmZmMDBcIjtcclxuXHRcdGdjLmxpbmVXaWR0aCA9IFwiMVwiO1xyXG5cdFx0Zm9yIChpID0gMDsgaSA8IG47IGkrKykge1xyXG5cdFx0XHRpZiAocm9ib3RbaV0uc3RhdHVzID09IFwiYXdha2VcIiB8fCByb2JvdFtpXS5zdGF0dXMgPT0gXCJzdG9wcGVkXCIpIHtcclxuXHRcdFx0XHRnYy5iZWdpblBhdGgoKTsgXHJcblx0XHRcdFx0Z2MubW92ZVRvKHJvYm90W2ldLngsIHJvYm90W2ldLnkpO1xyXG5cdFx0XHRcdGdjLmxpbmVUbyhyb2JvdFtpXS5sYXN0VGFyZ2V0eCwgcm9ib3RbaV0ubGFzdFRhcmdldHkpO1xyXG5cdFx0XHRcdGdjLnN0cm9rZSgpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRmb3IgKGkgPSAwOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRnYy5iZWdpblBhdGgoKTtcclxuXHRcdFx0Z2MubW92ZVRvKHBhdGhbaV1bMF0sIHBhdGhbaV1bMV0pO1xyXG5cdFx0XHRnYy5saW5lVG8ocGF0aFtpXVsyXSwgcGF0aFtpXVszXSk7XHJcblx0XHRcdGdjLnN0cm9rZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRcclxuXHRcclxuXHQvLyBkcmF3IHRoZSByb2JvdHNcclxuXHRmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XHJcblx0XHRpZiAocm9ib3RbaV0uc3RhdHVzID09IFwiYXdha2VcIiB8fCByb2JvdFtpXS5zdGF0dXMgPT1cInN0b3BwZWRcIikge2djLmZpbGxTdHlsZSA9IFwiIzAwRkYwMFwiO30gZWxzZSB7Z2MuZmlsbFN0eWxlID0gXCI1NTU1RkZcIjt9XHJcblx0XHRnYy5iZWdpblBhdGgoKTtcclxuXHRcdGdjLmFyYyhyb2JvdFtpXS54LCByb2JvdFtpXS55LCByb2JvdFJhZGl1cywgMCwgMiAqIE1hdGguUEksIGZhbHNlKTtcclxuXHRcdGdjLmZpbGwoKTtcclxuXHR9XHJcblx0Z2MuZm9udCA9IGZvbnQ7XHJcblx0Z2MudGV4dEFsaWduPVwiY2VudGVyXCI7XHJcblx0Z2MudGV4dEJhc2VsaW5lPVwibWlkZGxlXCJcclxuXHRnYy5maWxsU3R5bGUgPSBcIiMwMDAwMDBcIjtcclxuXHRmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XHJcblx0XHRnYy5maWxsVGV4dChpLCByb2JvdFtpXS54LCByb2JvdFtpXS55KTtcclxuXHR9XHJcbn1cclxuXHJcbi8qXHJcbmZ1bmN0aW9uIG9sZFVwZGF0ZVBvc2l0aW9uRnVuY3Rpb25UaGF0SGFzQnVnc0luSXQoKSB7XHRcclxuXHRmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xyXG5cdFx0XHJcblx0XHQvLyBjbGFpbSBhIG5ldyByb2JvdCBpZiBwb3NzaWJsZVxyXG5cdFx0aWYgKHJvYm90W2ldLnN0YXR1cyA9PSBcImF3YWtlXCIgJiYgcm9ib3RbaV0uY2xhaW1lZCA9PSAtMSkge1xyXG5cdFx0XHRpZiAoc2NoZWR1bGUubGVuZ3RoID09IDApIHtcclxuXHRcdFx0XHRyb2JvdFtpXS5zdGF0dXMgPSBcInN0b3BwZWRcIjtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRyb2JvdFtpXS5jbGFpbWVkID0gc2NoZWR1bGUuc2hpZnQoKTtcclxuXHRcdFx0XHRpZiAocm9ib3RbaV0uY2xhaW1lZCA9PSAtMSkge1xyXG5cdFx0XHRcdFx0cm9ib3RbaV0uc3RhdHVzID0gXCJzdG9wcGVkXCI7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdC8vIHVwZGF0ZSBkaXJlY3Rpb24gc3RvcmVkIHdpdGggcm9ib3RcclxuXHRcdFx0XHRpZiAocm9ib3RbaV0uY2xhaW1lZCAhPSAtMSkge1xyXG5cdFx0XHRcdFx0dmFyIGR4ID0gcm9ib3Rbcm9ib3RbaV0uY2xhaW1lZF0ueCAtIHJvYm90W2ldLng7XHJcblx0XHRcdFx0XHR2YXIgZHkgPSByb2JvdFtyb2JvdFtpXS5jbGFpbWVkXS55IC0gcm9ib3RbaV0ueTtcclxuXHRcdFx0XHRcdHZhciBsZW5ndGggPSBNYXRoLnNxcnQoZHgqZHggKyBkeSpkeSk7XHJcblx0XHRcdFx0XHR2YXIgbnVtU3RlcHMgPSBsZW5ndGggLyBkaXN0YW5jZVBlclRpbWVTdGVwO1xyXG5cdFx0XHRcdFx0cm9ib3RbaV0uZHggPSBkeCAvIG51bVN0ZXBzO1xyXG5cdFx0XHRcdFx0cm9ib3RbaV0uZHkgPSBkeSAvIG51bVN0ZXBzO1xyXG5cdFx0XHRcdFx0cm9ib3RbaV0uc3RlcHNUb1RhcmdldCA9IG51bVN0ZXBzO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0XHJcblx0XHQvLyBtb3ZlIHRvd2FyZCBjbGFpbWVkIHJvYm90XHJcblx0XHRpZiAocm9ib3RbaV0uc3RhdHVzID09IFwiYXdha2VcIikge1xyXG5cdFx0XHRpZiAocm9ib3RbaV0uc3RlcHNUb1RhcmdldCAgPD0gMSkge1xyXG5cdFx0XHRcdHRhcmdldCA9IHJvYm90W2ldLmNsYWltZWQ7XHJcblx0XHRcdFx0cm9ib3RbdGFyZ2V0XS5zdGF0dXMgPSBcImF3YWtlXCI7XHJcblx0XHRcdFx0cm9ib3RbaV0ueCA9IHJvYm90W3RhcmdldF0ueDtcclxuXHRcdFx0XHRyb2JvdFtpXS55ID0gcm9ib3RbdGFyZ2V0XS55O1xyXG5cdFx0XHRcdHZhciBwID0gW3JvYm90W2ldLmxhc3RUYXJnZXR4LCByb2JvdFtpXS5sYXN0VGFyZ2V0eSwgcm9ib3RbdGFyZ2V0XS54LCByb2JvdFt0YXJnZXRdLnldO1xyXG5cdFx0XHRcdHBhdGgucHVzaChwKTtcclxuXHRcdFx0XHRyb2JvdFtpXS5sYXN0VGFyZ2V0eCA9IHJvYm90W3RhcmdldF0ueDtcclxuXHRcdFx0XHRyb2JvdFtpXS5sYXN0VGFyZ2V0eSA9IHJvYm90W3RhcmdldF0ueTtcclxuXHRcdFx0XHRyb2JvdFtpXS5jbGFpbWVkID0gLTE7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0cm9ib3RbaV0ueCArPSByb2JvdFtpXS5keDtcclxuXHRcdFx0XHRyb2JvdFtpXS55ICs9IHJvYm90W2ldLmR5O1xyXG5cdFx0XHRcdHJvYm90W2ldLnN0ZXBzVG9UYXJnZXQgLT0gMTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxufVxyXG4qL1xyXG5cclxuZnVuY3Rpb24gdXBkYXRlUG9zaXRpb25UYWtlMigpIHtcclxuXHRcclxuXHR2YXIgcmVtYWluaW5nTW92ZW1lbnQgPSBkaXN0YW5jZVBlclRpbWVTdGVwO1xyXG5cdHdoaWxlIChyZW1haW5pbmdNb3ZlbWVudCA+IDApIHtcclxuXHRcdC8vIGZpbmQgZGlzdGFuY2UgdG8gY2xvc2VzdCB0YXJnZXRcclxuXHRcdHZhciBuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0ID0gLTE7XHJcblx0XHR2YXIgbWluRGlzdGFuY2UgPSAxMDAwMDA7XHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xyXG5cdFx0XHRpZiAocm9ib3RbaV0uc3RhdHVzID09IFwiYXdha2VcIiAmJiByb2JvdFtpXS5jbGFpbWVkID09IC0xICYmIHNjaGVkdWxlLmxlbmd0aCA9PSAwKSB7cm9ib3RbaV0uc3RhdHVzID0gXCJzdG9wcGVkXCI7fVxyXG5cdFx0XHRpZiAocm9ib3RbaV0uc3RhdHVzID09IFwiYXdha2VcIiAmJiByb2JvdFtpXS5jbGFpbWVkID09IC0xICYmIHNjaGVkdWxlLmxlbmd0aCA+IDApIHtcclxuXHRcdFx0XHRyb2JvdFtpXS5jbGFpbWVkID0gc2NoZWR1bGUuc2hpZnQoKTtcclxuXHRcdFx0XHRpZiAocm9ib3RbaV0uY2xhaW1lZCA9PSAtMSkge1xyXG5cdFx0XHRcdFx0cm9ib3RbaV0uc3RhdHVzID0gXCJzdG9wcGVkXCI7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0cm9ib3RbaV0uZHR0ID0gTWF0aC5zcXJ0KChyb2JvdFtpXS54LXJvYm90W3JvYm90W2ldLmNsYWltZWRdLngpKihyb2JvdFtpXS54LXJvYm90W3JvYm90W2ldLmNsYWltZWRdLngpICsgKHJvYm90W2ldLnktcm9ib3Rbcm9ib3RbaV0uY2xhaW1lZF0ueSkqKHJvYm90W2ldLnktcm9ib3Rbcm9ib3RbaV0uY2xhaW1lZF0ueSkpXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChyb2JvdFtpXS5zdGF0dXMgPT0gXCJhd2FrZVwiKSB7XHJcblx0XHRcdFx0aWYgKHJvYm90W2ldLmR0dCA8IG1pbkRpc3RhbmNlKSB7bWluRGlzdGFuY2UgPSByb2JvdFtpXS5kdHQ7IG5leHRSb2JvdFRvUmVhY2hUYXJnZXQgPSBpO31cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0Ly8gaWYgbm8gcm9ib3QgaXMgY2xvc2UgZW5vdWdoIHRvIGF3YWtlbiBkdXJpbmcgdGhpcyB0aW1lIHN0ZXBcclxuXHRcdGlmIChtaW5EaXN0YW5jZSA+IHJlbWFpbmluZ01vdmVtZW50KSB7XHJcblx0XHRcdG1vdmVSb2JvdHMocmVtYWluaW5nTW92ZW1lbnQpO1xyXG5cdFx0XHRyZW1haW5pbmdNb3ZlbWVudCA9IDA7XHJcblx0XHR9XHJcblx0XHQvLyBpZiBhIHJvYm90IGlzIGNsb3NlIGVub3VnaCB0byBhd2FrZW4gZHVyaW5nIHRoaXMgdGltZSBzdGVwXHJcblx0XHRpZiAobWluRGlzdGFuY2UgPD0gcmVtYWluaW5nTW92ZW1lbnQpIHtcclxuXHRcdFx0bW92ZVJvYm90cyhtaW5EaXN0YW5jZSk7XHJcblx0XHRcdHJlbWFpbmluZ01vdmVtZW50IC09IG1pbkRpc3RhbmNlO1x0XHRcdFx0XHRcdFx0XHQvLyB1cGRhdGUgcmVtYWluaW5nIG1vdmVtZW50XHJcblx0XHRcdFxyXG5cdFx0XHR0YXJnZXQgPSByb2JvdFtuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0XS5jbGFpbWVkO1xyXG5cdFx0XHRyb2JvdFt0YXJnZXRdLnN0YXR1cyA9IFwiYXdha2VcIjtcdFx0XHRcdFx0XHRcdFx0XHQvLyB3YWtlIHVwIHRhcmdldFxyXG5cdFx0XHRyb2JvdFtuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0XS5jbGFpbWVkID0gLTE7XHRcdFx0XHRcdFx0Ly8gcmVtb3ZlIHRhcmdldCBmcm9tIHdha2VyXHJcblx0XHRcdFxyXG5cdFx0XHQvLyBmb3IgZHJhd2luZyB0aGUgcGF0aHMgb24gdGhlIHNjcmVlblxyXG5cdFx0XHR2YXIgcCA9IFtyb2JvdFtuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0XS5sYXN0VGFyZ2V0eCwgcm9ib3RbbmV4dFJvYm90VG9SZWFjaFRhcmdldF0ubGFzdFRhcmdldHksIHJvYm90W3RhcmdldF0ueCwgcm9ib3RbdGFyZ2V0XS55XTtcclxuXHRcdFx0cGF0aC5wdXNoKHApO1xyXG5cdFx0XHRyb2JvdFtuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0XS5sYXN0VGFyZ2V0eCA9IHJvYm90W3RhcmdldF0ueDtcclxuXHRcdFx0cm9ib3RbbmV4dFJvYm90VG9SZWFjaFRhcmdldF0ubGFzdFRhcmdldHkgPSByb2JvdFt0YXJnZXRdLnk7XHJcblx0XHR9XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBtb3ZlUm9ib3RzKGRpc3QpIHtcclxuXHRmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xyXG5cdFx0aWYgKHJvYm90W2ldLnN0YXR1cyA9PSBcImF3YWtlXCIpIHtcclxuXHRcdFx0cm9ib3RbaV0ueCArPSAocm9ib3Rbcm9ib3RbaV0uY2xhaW1lZF0ueCAtIHJvYm90W2ldLngpKmRpc3QgLyByb2JvdFtpXS5kdHQ7XHJcblx0XHRcdHJvYm90W2ldLnkgKz0gKHJvYm90W3JvYm90W2ldLmNsYWltZWRdLnkgLSByb2JvdFtpXS55KSpkaXN0IC8gcm9ib3RbaV0uZHR0O1xyXG5cdFx0XHRyb2JvdFtpXS5kdHQgLT1kaXN0O1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5cclxudmFyIHJvYm90ID0gaW5pdGlhbGl6ZVJvYm90cyhuKTtcclxudmFyIGVkZ2VzID0gZGVsYXVuYXlFZGdlcygpO1xyXG5mdW5jdGlvbiBpbml0aWFsaXplUm9ib3RzKG4pIHtcclxuXHR2YXIgciA9IG5ldyBBcnJheSgpO1xyXG5cdGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcclxuXHRcdHZhciBhID0gTWF0aC5yYW5kb20oKSood2lkdGgtMipyb2JvdFJhZGl1cykgKyByb2JvdFJhZGl1cztcclxuXHRcdHZhciBiID0gTWF0aC5yYW5kb20oKSooaGVpZ2h0LTIqcm9ib3RSYWRpdXMpICsgcm9ib3RSYWRpdXM7XHJcblx0XHRyW2ldID0ge1xyXG5cdFx0XHRpZDogaSxcclxuXHRcdFx0aW5pdGlhbFg6IGEsXHJcblx0XHRcdGluaXRpYWxZOiBiLFxyXG5cdFx0XHR4OiBhLFxyXG5cdFx0XHR5OiBiLFxyXG5cdFx0XHRsYXN0VGFyZ2V0eDogYSxcclxuXHRcdFx0bGFzdFRhcmdldHk6IGIsXHJcblx0XHRcdHN0YXR1czogXCJzbGVlcGluZ1wiLFxyXG5cdFx0XHRjbGFpbWVkOiAtMSxcclxuXHRcdFx0ZHg6IDAsXHJcblx0XHRcdGR5OiAwLFxyXG5cdFx0XHRzdGVwc1RvVGFyZ2V0OiAwXHJcblx0XHR9XHJcblx0fVxyXG5cdHJbMF0uc3RhdHVzID0gXCJhd2FrZVwiO1xyXG5cdHJldHVybiByO1xyXG59XHJcblxyXG5cclxuLypcclxudmFyIHRyaWFuZ3VsYXRlID0gcmVxdWlyZShcImRlbGF1bmF5LXRyaWFuZ3VsYXRlXCIpOyAgLy9odHRwczovL25wbWpzLm9yZy9wYWNrYWdlL2RlbGF1bmF5LXRyaWFuZ3VsYXRlIHRoYW5rcyBNaWtcclxuXHJcbnZhciBwb2ludHMgPSBbXHJcblswLDFdLFxyXG5bMSwwXSxcclxuWzEsMV0sXHJcblswLDBdLFxyXG5bMC41LDAuNV0sXHJcblswLjUsMS4xXVxyXG5dO1xyXG5cclxudmFyIHRyaWFuZ2xlcyA9IHRyaWFuZ3VsYXRlKHBvaW50cyk7XHJcblxyXG5jb25zb2xlLmxvZyh0cmlhbmdsZXMpO1xyXG4qL1xyXG5cclxuLy8gcmV0dXJucyB0aGUgRGVsYXVuYXkgVHJpYW5ndWxhdGlvbiBhcyBhIHR3aW4tZWRnZSBkYXRhIHN0cnVjdHVyZVxyXG4vLyBmdW5jdGlvbiBkZWxhdW5heVRyaWFuZ2x1YXRpb24oKSB7fVxyXG5cclxuXHJcbi8vIHJldHVybnMgdGhlIGxpc3Qgb2YgZWRnZXMgaW4gdGhlIGRlbGF1bmF5IHRyaWFuZ3VsYXRpb25cclxuZnVuY3Rpb24gZGVsYXVuYXlFZGdlcygpIHtcclxuXHR2YXIgdHJpYW5ndWxhdGUgPSByZXF1aXJlKFwiZGVsYXVuYXktdHJpYW5ndWxhdGVcIik7ICAvL2h0dHBzOi8vbnBtanMub3JnL3BhY2thZ2UvZGVsYXVuYXktdHJpYW5ndWxhdGUgdGhhbmtzIE1pa1xyXG5cdFxyXG5cdHBvaW50cyA9IG5ldyBBcnJheSgpO1xyXG5cdGZvciAoaSA9IDA7IGk8bjsgaSsrKSB7XHJcblx0XHR2YXIgcCA9IFtyb2JvdFtpXS54LCByb2JvdFtpXS55XVxyXG5cdFx0cG9pbnRzLnB1c2gocCk7XHJcblx0fVxyXG5cdHZhciB0ID0gdHJpYW5ndWxhdGUocG9pbnRzKTtcclxuXHR2YXIgZSA9IG5ldyBBcnJheSgpO1xyXG5cdGZvciAoaSA9IDA7IGkgPCB0Lmxlbmd0aDsgaSsrKSB7XHJcblx0XHR2YXIgcDAgPSBwb2ludHNbdFtpXVswXV07XHJcblx0XHR2YXIgcDEgPSBwb2ludHNbdFtpXVsxXV07XHJcblx0XHR2YXIgcDIgPSBwb2ludHNbdFtpXVsyXV07XHJcblx0XHRlLnB1c2goW3AwWzBdLCBwMFsxXSwgcDFbMF0sIHAxWzFdXSk7XHJcblx0XHRlLnB1c2goW3AxWzBdLCBwMVsxXSwgcDJbMF0sIHAyWzFdXSk7XHJcblx0XHRlLnB1c2goW3AyWzBdLCBwMlsxXSwgcDBbMF0sIHAwWzFdXSk7XHJcblx0fVxyXG5cdHJldHVybiBlO1xyXG59XHJcblxyXG5cclxuLy8gYmVsb3cgaXMgdGhlIGNvZGUgdGhhdCBydW5zIHRoZSAgYnV0dG9uc1xyXG52YXIgcGxheUJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcGxheUJ1dHRvblwiKTtcclxucGxheUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgcGxheUJ1dHRvbkhhbmRsZXIpO1xyXG5mdW5jdGlvbiBwbGF5QnV0dG9uSGFuZGxlcihldmVudCkge1xyXG5cdGlmIChydW5TaW11bGF0aW9uID09IGZhbHNlKSB7XHJcblx0XHRydW5TaW11bGF0aW9uID0gdHJ1ZTtcclxuXHRcdHBsYXlCdXR0b24uaW5uZXJIVE1MID0gXCJQYXVzZVwiO1xyXG5cdH1cclxuXHRlbHNlIHtcclxuXHRcdHJ1blNpbXVsYXRpb24gPSBmYWxzZTtcclxuXHRcdHBsYXlCdXR0b24uaW5uZXJIVE1MID0gXCJQbGF5XCI7XHJcblx0fVxyXG59XHJcblxyXG52YXIgcmVzZXRCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3Jlc2V0QnV0dG9uXCIpO1xyXG5yZXNldEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgcmVzZXRCdXR0b25IYW5kbGVyKTtcclxuZnVuY3Rpb24gcmVzZXRCdXR0b25IYW5kbGVyKGV2ZW50KSB7XHJcblx0dmFyIHIgPSBuZXcgQXJyYXkoKTtcclxuXHRmb3IgKHZhciBpID0gMDsgaTxuOyBpKyspIHtcclxuXHRcdHZhciBhID0gcm9ib3RbaV0uaW5pdGlhbFg7XHJcblx0XHR2YXIgYiA9IHJvYm90W2ldLmluaXRpYWxZO1xyXG5cdFx0cltpXSA9IHtcclxuXHRcdFx0aW5pdGlhbFg6IGEsXHJcblx0XHRcdGluaXRpYWxZOiBiLFxyXG5cdFx0XHR4OiBhLFxyXG5cdFx0XHR5OiBiLFxyXG5cdFx0XHRsYXN0VGFyZ2V0eDogYSxcclxuXHRcdFx0bGFzdFRhcmdldHk6IGIsXHJcblx0XHRcdHN0YXR1czogXCJzbGVlcGluZ1wiLFxyXG5cdFx0XHRjbGFpbWVkOiAtMSxcclxuXHRcdFx0ZHg6IDAsXHJcblx0XHRcdGR5OiAwLFxyXG5cdFx0XHRzdGVwc1RvVGFyZ2V0OiAwLFxyXG5cdFx0XHRkdHQ6IDBcclxuXHRcdH1cclxuXHR9XHJcblx0clswXS5zdGF0dXMgPSBcImF3YWtlXCJcclxuXHRyb2JvdCA9IHI7XHJcblx0c2NoZWR1bGUgPSBnZW5lcmF0ZVNjaGVkdWxlKCk7XHJcblx0cGF0aCA9IG5ldyBBcnJheSgpO1xyXG5cdHJ1blNpbXVsYXRpb24gPSBmYWxzZTtcclxuXHRzdGVwcyA9IDA7XHJcblx0c2ltdWxhdGlvbkZpbmlzaGVkID0gZmFsc2U7XHJcblx0cGxheUJ1dHRvbi5pbm5lckhUTUwgPSBcIlBsYXlcIjtcclxufVxyXG5cclxuXHJcbnZhciBzaG93UGF0aHNCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3Nob3dQYXRoc0J1dHRvblwiKTtcclxuc2hvd1BhdGhzQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzaG93UGF0aHNCdXR0b25IYW5kbGVyKTtcclxuZnVuY3Rpb24gc2hvd1BhdGhzQnV0dG9uSGFuZGxlcihldmVudCkge1xyXG5cdHNob3dQYXRocyA9PSB0cnVlID8gc2hvd1BhdGhzID0gZmFsc2U6IHNob3dQYXRocz10cnVlO1xyXG59XHJcblxyXG52YXIgc2hvd0RlbGF1bmF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzaG93RGVsYXVuYXlcIik7XHJcbnNob3dEZWxhdW5heS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgc2hvd0RlbGF1bmF5SGFuZGxlcik7XHJcbmZ1bmN0aW9uIHNob3dEZWxhdW5heUhhbmRsZXIoZXZlbnQpIHtcclxuXHRzaG93RGVsYXVuYXlFZGdlcyA9PSB0cnVlID8gc2hvd0RlbGF1bmF5RWRnZXMgPSBmYWxzZTogc2hvd0RlbGF1bmF5RWRnZXM9dHJ1ZTtcclxufVxyXG5cclxuXHJcbnZhciBzdGVwQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNzdGVwQnV0dG9uXCIpO1xyXG5zdGVwQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGVwQnV0dG9uSGFuZGxlcik7XHJcbmZ1bmN0aW9uIHN0ZXBCdXR0b25IYW5kbGVyKGV2ZW50KSB7XHJcbn1cclxuXHJcbnZhciBudW1iZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI251bWJlclwiKTtcclxubnVtYmVyLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBudW1iZXJDbGlja0hhbmRsZXIpO1xyXG5mdW5jdGlvbiBudW1iZXJDbGlja0hhbmRsZXIoZXZlbnQpIHtcclxuXHRudW1iZXIudmFsdWUgPSBcIlwiO1xyXG59XHJcbm51bWJlci5hZGRFdmVudExpc3RlbmVyKFwia2V5cHJlc3NcIiwgbnVtYmVySW5wdXRIYW5kbGVyKTtcclxuZnVuY3Rpb24gbnVtYmVySW5wdXRIYW5kbGVyKGV2ZW50KSB7XHJcblx0aWYgKGV2ZW50LmNoYXJDb2RlID09IDEzKSB7XHJcblx0XHRuID0gcGFyc2VJbnQobnVtYmVyLnZhbHVlKTtcclxuXHRcdHJvYm90ID0gaW5pdGlhbGl6ZVJvYm90cyhuKTtcclxuXHRcdGVkZ2VzID0gZGVsYXVuYXlFZGdlcygpO1xyXG5cdFx0c2NoZWR1bGUgPSBuZXcgQXJyYXkoKTtcclxuXHRcdHNjaGVkdWxlID0gZ2VuZXJhdGVTY2hlZHVsZSgpO1xyXG5cdFx0cGF0aCA9IG5ldyBBcnJheSgpO1xyXG5cdFx0cnVuU2ltdWxhdGlvbiA9IGZhbHNlO1xyXG5cdFx0c3RlcHMgPSAwO1xyXG5cdFx0c2ltdWxhdGlvbkZpbmlzaGVkID0gZmFsc2U7XHJcblx0XHRudW1iZXIudmFsdWU9XCJcIiArIG4gKyBcIiByb2JvdHNcIjtcclxuXHRcdHBsYXlCdXR0b24uaW5uZXJIVE1MID0gXCJQbGF5XCI7XHJcblx0fVxyXG59XHJcblxyXG5cclxudmFyIGluT3JkZXJCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2luT3JkZXJCdXR0b25cIik7XHJcbnZhciBncmVlZHlDbGFpbUJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZ3JlZWR5Q2xhaW1CdXR0b25cIik7XHJcbnZhciBncmVlZHlEeW5hbWljQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNncmVlZHlEeW5hbWljQnV0dG9uXCIpO1xyXG52YXIgY29uc3RhbnRCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2NvbnN0YW50QnV0dG9uXCIpO1xyXG4vL3ZhciBicnV0ZUZvcmNlQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNicnV0ZUZvcmNlQnV0dG9uXCIpO1xyXG5cclxuZnVuY3Rpb24gZ3JheUJ1dHRvbnMoKSB7XHJcblx0Y29sb3IgPSBcIiNjY2NjY2NcIjtcclxuXHRpbk9yZGVyQnV0dG9uLnN0eWxlLmJhY2tncm91bmQ9Y29sb3I7XHJcblx0Z3JlZWR5Q2xhaW1CdXR0b24uc3R5bGUuYmFja2dyb3VuZD1jb2xvcjtcclxuXHRncmVlZHlEeW5hbWljQnV0dG9uLnN0eWxlLmJhY2tncm91bmQ9Y29sb3I7XHJcblx0Y29uc3RhbnRCdXR0b24uc3R5bGUuYmFja2dyb3VuZD1jb2xvcjtcclxuXHQvL2JydXRlRm9yY2VCdXR0b24uc3R5bGUuYmFja2dyb3VuZD1jb2xvcjtcclxuXHRyZXNldEJ1dHRvbkhhbmRsZXIoKTtcclxuXHRwYXRoID0gbmV3IEFycmF5KCk7XHJcbn1cclxuZ3JheUJ1dHRvbnMoKTtcclxuaW5PcmRlckJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kPScjOTlmZjk5JztcclxuXHJcbmluT3JkZXJCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGluT3JkZXJCdXR0b25IYW5kbGVyKTtcclxuZnVuY3Rpb24gaW5PcmRlckJ1dHRvbkhhbmRsZXIoZXZlbnQpIHtcclxuXHRhbGdvcml0aG0gPSBcImluIG9yZGVyXCI7XHJcblx0Z3JheUJ1dHRvbnMoKTtcclxuXHRpbk9yZGVyQnV0dG9uLnN0eWxlLmJhY2tncm91bmQ9JyM5OWZmOTknO1xyXG59XHJcbi8qXHJcbmJydXRlRm9yY2VCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGJydXRlRm9yY2VCdXR0b25IYW5kbGVyKTtcclxuZnVuY3Rpb24gYnJ1dGVGb3JjZUJ1dHRvbkhhbmRsZXIoZXZlbnQpIHtcclxuXHRhbGdvcml0aG0gPSBcImJydXRlIGZvcmNlXCI7XHJcblx0Z3JheUJ1dHRvbnMoKTtcclxuXHRicnV0ZUZvcmNlQnV0dG9uLnN0eWxlLmJhY2tncm91bmQ9JyM5OWZmOTknO1xyXG59XHJcbiovXHJcblxyXG5ncmVlZHlDbGFpbUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZ3JlZWR5Q2xhaW1CdXR0b25IYW5kbGVyKTtcclxuZnVuY3Rpb24gZ3JlZWR5Q2xhaW1CdXR0b25IYW5kbGVyKGV2ZW50KSB7XHJcblx0YWxnb3JpdGhtID0gXCJncmVlZHkgY2xhaW1cIjtcclxuXHRncmF5QnV0dG9ucygpO1xyXG5cdGdyZWVkeUNsYWltQnV0dG9uLnN0eWxlLmJhY2tncm91bmQ9JyM5OWZmOTknO1xyXG59XHJcblxyXG5ncmVlZHlEeW5hbWljQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBncmVlZHlEeW5hbWljQnV0dG9uSGFuZGxlcik7XHJcbmZ1bmN0aW9uIGdyZWVkeUR5bmFtaWNCdXR0b25IYW5kbGVyKGV2ZW50KSB7XHJcblx0YWxnb3JpdGhtID0gXCJncmVlZHkgZHluYW1pY1wiO1xyXG5cdGdyYXlCdXR0b25zKCk7XHJcblx0Z3JlZWR5RHluYW1pY0J1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kPScjOTlmZjk5JztcclxufVxyXG5cclxuY29uc3RhbnRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNvbnN0YW50QnV0dG9uSGFuZGxlcik7XHJcbmZ1bmN0aW9uIGNvbnN0YW50QnV0dG9uSGFuZGxlcihldmVudCkge1xyXG5cdGFsZ29yaXRobSA9IFwiY29uc3RhbnRcIjtcclxuXHRncmF5QnV0dG9ucygpO1xyXG5cdGNvbnN0YW50QnV0dG9uLnN0eWxlLmJhY2tncm91bmQ9JyM5OWZmOTknO1xyXG59XHJcblxyXG52YXIgc2NoZWR1bGUgPSBuZXcgQXJyYXkoKTtcclxuc2NoZWR1bGUgPSBnZW5lcmF0ZVNjaGVkdWxlKCk7XHJcblxyXG5mdW5jdGlvbiBnZW5lcmF0ZVNjaGVkdWxlKCkge1xyXG5cdHMgPSBuZXcgQXJyYXkoKTtcclxuXHRpZiAoYWxnb3JpdGhtID09IFwiaW4gb3JkZXJcIikge1xyXG5cdFx0cyA9IGluT3JkZXJTY2hlZHVsZSgpO1xyXG5cdH1cclxuXHRpZiAoYWxnb3JpdGhtID09IFwiZ3JlZWR5IGNsYWltXCIpIHtcclxuXHRcdHMgPSBncmVlZHlDbGFpbVNjaGVkdWxlVGFrZTIoKTtcclxuXHR9XHJcblx0aWYgKGFsZ29yaXRobSA9PSBcImdyZWVkeSBkeW5hbWljXCIpIHtcclxuXHRcdHMgPSBncmVlZHlEeW5hbWljU2NoZWR1bGUoKTtcclxuXHR9XHJcblx0aWYgKGFsZ29yaXRobSA9PSBcImNvbnN0YW50XCIpIHtcclxuXHRcdHMgPSBjb25zdGFudFNjaGVkdWxlKCk7XHJcblx0fVxyXG5cdC8qaWYgKGFsZ29yaXRobSA9PSBcImJydXRlIGZvcmNlXCIpIHtcclxuXHRcdHMgPSBicnV0ZUZvcmNlU2NoZWR1bGUoKTtcclxuXHR9Ki9cclxuXHRyZXR1cm4gcztcclxufVxyXG5cclxuZnVuY3Rpb24gaW5PcmRlclNjaGVkdWxlKCkge1xyXG5cdHMgPSBuZXcgQXJyYXkoKTtcclxuXHRmb3IgKGkgPSAxOyBpPG47IGkrKykge1xyXG5cdFx0cy5wdXNoKGkpO1xyXG5cdH1cclxuXHRyZXR1cm4gcztcclxufVxyXG5cclxuZnVuY3Rpb24gZ3JlZWR5Q2xhaW1TY2hlZHVsZVRha2UyKCkge1xyXG5cdHZhciBzID0gbmV3IEFycmF5KCk7XHJcblx0dmFyIHRpbWUgPSAwO1xyXG5cdHZhciBzbGVlcGluZ0NvdW50ID0gbi0xO1xyXG5cclxuXHQvLyBtYWtlIGEgY29weSBvZiB0aGUgcm9ib3RzXHJcblx0ciA9IG5ldyBBcnJheSgpO1xyXG5cdGZvciAoaSA9IDA7IGk8bjsgaSsrKSB7XHJcblx0XHRyLnB1c2goe1xyXG5cdFx0XHR4OiByb2JvdFtpXS54LFxyXG5cdFx0XHR5OiByb2JvdFtpXS55LFxyXG5cdFx0XHRzdGF0dXM6IHJvYm90W2ldLnN0YXR1cyxcclxuXHRcdFx0dGFyZ2V0OiAtMSxcclxuXHRcdFx0YXJyaXZhbFRpbWU6IDBcclxuXHRcdH0pXHJcblx0fVxyXG5cdFxyXG5cdHdoaWxlIChzbGVlcGluZ0NvdW50ID4gMCkge1xyXG5cdFx0dmFyIG1pblRpbWUgPSAxMDAwMDtcclxuXHRcdHZhciBuZXh0Um9ib3QgPSAtMTtcclxuXHRcdFxyXG5cdFx0Ly8gZGV0ZXJtaW5lIHdoaWNoIHJvYm90IHdpbGwgcmVhY2ggaXRzIHRhcmdldCBuZXh0XHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xyXG5cdFx0XHRpZiAocltpXS5zdGF0dXMgPT0gXCJhd2FrZVwiKSB7XHJcblxyXG5cdFx0XHRcdC8vIGlmIHRoZSByb2JvdCBkb2Vzbid0IGhhdmUgYSB0YXJnZXRcclxuXHRcdFx0XHRpZiAocltpXS50YXJnZXQgPT0gLTEpIHtcclxuXHJcblx0XHRcdFx0XHQvL2NsYWltIGEgbmV3IHRhcmdldCBhbmQgY2FsY3VsYXRlIGFycml2YWwgdGltZVxyXG5cdFx0XHRcdFx0dmFyIGNsb3Nlc3RTbGVlcGluZ1JvYm90ID0gLTE7XHJcblx0XHRcdFx0XHR2YXIgbWluRGlzdCA9IDExMDAwMDAwMDtcclxuXHRcdFx0XHRcdGZvciAodmFyIGogPSAwOyBqPG47IGorKykge1xyXG5cdFx0XHRcdFx0XHRpZiAocltqXS5zdGF0dXMgPT0gXCJzbGVlcGluZ1wiKSB7XHJcblx0XHRcdFx0XHRcdFx0dmFyIGRpc3RhbmNlID0gTWF0aC5zcXJ0KChyW2ldLngtcltqXS54KSoocltpXS54LXJbal0ueCkgKyAocltpXS55LXJbal0ueSkqKHJbaV0ueS1yW2pdLnkpKTtcclxuXHRcdFx0XHRcdFx0XHRpZiAoZGlzdGFuY2UgPCBtaW5EaXN0KSB7XHJcblx0XHRcdFx0XHRcdFx0XHRtaW5EaXN0ID0gZGlzdGFuY2U7XHJcblx0XHRcdFx0XHRcdFx0XHRjbG9zZXN0U2xlZXBpbmdSb2JvdCA9IGo7XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRpZiAocy5sZW5ndGggPCBuLTEpIHtcclxuXHRcdFx0XHRcdFx0cy5wdXNoKGNsb3Nlc3RTbGVlcGluZ1JvYm90KTtcclxuXHRcdFx0XHRcdFx0cltpXS50YXJnZXQgPSBjbG9zZXN0U2xlZXBpbmdSb2JvdDtcclxuXHRcdFx0XHRcdFx0cltpXS5hcnJpdmFsVGltZSA9IHRpbWUgKyBtaW5EaXN0O1xyXG5cdFx0XHRcdFx0XHRyW2Nsb3Nlc3RTbGVlcGluZ1JvYm90XS5zdGF0dXMgPSBcImNsYWltZWRcIjtcclxuXHRcdFx0XHRcdFx0c2xlZXBpbmdDb3VudC0tO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRpZiAocltpXS5hcnJpdmFsVGltZSA8IG1pblRpbWUpIHtcclxuXHRcdFx0XHRcdG1pblRpbWUgPSByW2ldLmFycml2YWxUaW1lOyBcclxuXHRcdFx0XHRcdG5leHRSb2JvdCA9IGk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdC8vIG5vdyB3ZSBrbm93IHdoaWNoIHJvYm90IHdpbGwgYXJyaXZlIGF0IGl0cyB0YXJnZXQgbmV4dCBhbmQgd2hlbiBpdCB3aWxsIGdldCB0aGVyZVxyXG5cdFx0dGltZSA9IG1pblRpbWU7XHJcblx0XHR2YXIgdGFyZ2V0ID0gcltuZXh0Um9ib3RdLnRhcmdldDtcclxuXHRcdHJbbmV4dFJvYm90XS54ID0gclt0YXJnZXRdLng7XHJcblx0XHRyW25leHRSb2JvdF0ueSA9IHJbdGFyZ2V0XS55O1xyXG5cdFx0cltuZXh0Um9ib3RdLnRhcmdldCA9IC0xO1xyXG5cdFx0clt0YXJnZXRdLnN0YXR1cyA9IFwiYXdha2VcIjtcclxuXHR9XHJcblx0cmV0dXJuIHM7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBncmVlZHlDbGFpbVNjaGVkdWxlKCkge1xyXG5cdHMgPSBuZXcgQXJyYXkoKTtcclxuXHRcclxuXHQvLyBtYWtlIGEgY29weSBvZiB0aGUgcm9ib3RzXHJcblx0ciA9IG5ldyBBcnJheSgpO1xyXG5cdGZvciAoaSA9IDA7IGk8bjsgaSsrKSB7XHJcblx0XHRyLnB1c2goe1xyXG5cdFx0XHR4OiByb2JvdFtpXS54LFxyXG5cdFx0XHR5OiByb2JvdFtpXS55LFxyXG5cdFx0XHRzdGF0dXM6IHJvYm90W2ldLnN0YXR1cyxcclxuXHRcdFx0Y2xhaW06IC0xLFxyXG5cdFx0XHRkaXN0YW5jZVRyYXZlbGVkQnlQcmV2aW91c1JvYm90OiAwLFxyXG5cdFx0XHRkaXN0YW5jZTogMTAwMDAwMDAwMDAwMDAwXHJcblx0XHR9KVxyXG5cdH1cclxuXHRcclxuXHQvLyBmaWxsIGluIHRoZSBzY2hlZHVsZVxyXG5cdGZvciAodmFyIHggPSAxOyB4IDwgbjsgeCsrKSB7XHJcblx0XHQvL3VwZGF0ZSBjbGFpbXMgXHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xyXG5cdFx0XHRpZiAocltpXS5zdGF0dXMgPT0gXCJhd2FrZVwiICYmIHJbaV0uY2xhaW0gPT0gLTEpIHtcclxuXHRcdFx0XHRmb3IgKHZhciBqID0gMDsgaiA8IG47IGorKykge1xyXG5cdFx0XHRcdFx0aWYgKHJbal0uc3RhdHVzID09IFwic2xlZXBpbmdcIikge1xyXG5cdFx0XHRcdFx0XHR2YXIgZCA9IE1hdGguc3FydCgocltpXS54LXJbal0ueCkgKiAocltpXS54LXJbal0ueCkgKyAocltpXS55LXJbal0ueSkqKHJbaV0ueS1yW2pdLnkpKSArIHJbaV0uZGlzdGFuY2VUcmF2ZWxlZEJ5UHJldmlvdXNSb2JvdDtcclxuXHRcdFx0XHRcdFx0aWYgKGQgPCByW2ldLmRpc3RhbmNlKSB7XHJcblx0XHRcdFx0XHRcdFx0cltpXS5kaXN0YW5jZSA9IGQ7XHJcblx0XHRcdFx0XHRcdFx0cltpXS5jbGFpbSA9IGo7XHJcblx0XHRcdFx0XHRcdFx0cltqXS5kaXN0YW5jZVRyYXZlbGVkQnlQcmV2aW91c1JvYm90ID0gZCtyW2ldLmRpc3RhbmNlVHJhdmVsZWRCeVByZXZpb3VzUm9ib3Q7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0aWYgKHJbaV0uY2xhaW0gPT0gLTEpIHtyZXR1cm4gczt9XHJcblx0XHRcdFx0cltyW2ldLmNsYWltXS5zdGF0dXMgPSBcImNsYWltZWRcIjtcclxuXHRcdFx0XHRzLnB1c2gocltpXS5jbGFpbSk7XHJcblxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRcdFx0XHJcblx0XHQvL2ZpbmQgbmV4dCByb2JvdCB0byByZWFjaCBpdHMgdGFyZ2V0XHJcblx0XHR2YXIgZCA9IDEwMDAwMDAwMDAwMDAwMDtcclxuXHRcdHZhciB0ID0gMDtcclxuXHRcdHZhciByTmV4dCA9IC0xO1xyXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGk8bjsgaSsrKSB7XHJcblx0XHRcdGlmIChyW2ldLmRpc3RhbmNlIDwgZCkge2QgPSByW2ldLmRpc3RhbmNlOyByTmV4dD1pOyB0ID0gaTt9XHJcblx0XHR9XHJcblx0XHRyW3RdLmRpc3RhbmNlVHJhdmVsZWRCeVByZXZpb3VzUm9ib3QgPSByW3RdLmRpc3RhbmNlVHJhdmVsZWRCeVByZXZpb3VzUm9ib3QrZDtcclxuXHRcdHJbck5leHRdLmRpc3RhbmNlID0gMTAwMDAwMDAwMDAwMDAwO1xyXG5cdFx0cltyW3JOZXh0XS5jbGFpbV0uc3RhdHVzID0gXCJhd2FrZVwiXHJcblx0XHRcclxuXHRcdHJbck5leHRdLnggPSByW3Jbck5leHRdLmNsYWltXS54O1xyXG5cdFx0cltyTmV4dF0ueSA9IHJbcltyTmV4dF0uY2xhaW1dLnk7XHJcblx0XHRcclxuXHRcdHJbck5leHRdLmNsYWltID0gLTE7XHJcblx0fVxyXG5cdHJldHVybiBzO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZ3JlZWR5RHluYW1pY1NjaGVkdWxlKCkge1xyXG5cdC8vIG1ha2UgYSBjb3B5IG9mIHRoZSByb2JvdHNcclxuXHRyID0gbmV3IEFycmF5KCk7XHJcblx0Zm9yIChpID0gMDsgaTxuOyBpKyspIHtcclxuXHRcdHIucHVzaCh7XHJcblx0XHRcdHg6IHJvYm90W2ldLngsXHJcblx0XHRcdHk6IHJvYm90W2ldLnksXHJcblx0XHRcdHN0YXR1czogcm9ib3RbaV0uc3RhdHVzLFxyXG5cdFx0XHRkaXN0YW5jZUFjcXVpcmVkU2luY2VMYXN0SnVtcDogMCxcclxuXHRcdFx0cmVtYWluaW5nRGlzdGFuY2VUb0Nsb3Nlc3RUYXJnZXQ6IDEwMDAwLFxyXG5cdFx0XHRjbG9zZXN0OiAtMSxcclxuXHRcdFx0fSlcclxuXHR9XHJcblx0XHJcblx0Ly9pbml0aWFsaXplIHRoZSB0YXJnZXQgbGlzdFxyXG5cdHZhciB0YXJnZXRMaXN0ID0gbmV3IEFycmF5KCk7XHJcblx0dGFyZ2V0TGlzdC5wdXNoKFswLCAtMV0pO1xyXG5cdFxyXG5cdFxyXG5cdC8vZmlsbCBpbiB0aGUgdGFyZ2V0IGxpc3RcclxuXHRmb3IgKHZhciB4ID0gMTsgeCA8IG47IHgrKykge1xyXG5cclxuXHRcdC8vY2FsY3VsYXRlIGRpc3RhbmNlIHRvIG5lYXJlc3Qgcm9ib3QgZm9yIGFsbCBhd2FrZSByb2JvdHNcclxuXHRcdGZvciAoaSA9IDA7IGk8bjsgaSsrKSB7XHJcblx0XHRcdGlmIChyW2ldLnN0YXR1cyA9PSBcImF3YWtlXCIpIHtcclxuXHRcdFx0XHRyW2ldLmNsb3Nlc3QgPSAtMTtcclxuXHRcdFx0XHRyW2ldLnJlbWFpbmluZ0Rpc3RhbmNlVG9DbG9zZXN0VGFyZ2V0ID0gMTAwMDA7XHJcblx0XHRcdFx0Zm9yIChqID0gMDsgaiA8IG47IGorKykge1xyXG5cdFx0XHRcdFx0aWYgKHJbal0uc3RhdHVzID09IFwic2xlZXBpbmdcIikge1xyXG5cdFx0XHRcdFx0XHR2YXIgZCA9IE1hdGguc3FydCgocltpXS54LXJbal0ueCkgKiAocltpXS54LXJbal0ueCkgKyAocltpXS55LXJbal0ueSkqKHJbaV0ueS1yW2pdLnkpKSAtIHJbaV0uZGlzdGFuY2VBY3F1aXJlZFNpbmNlTGFzdEp1bXA7XHJcblx0XHRcdFx0XHRcdGlmIChkIDwgcltpXS5yZW1haW5pbmdEaXN0YW5jZVRvQ2xvc2VzdFRhcmdldCkge1xyXG5cdFx0XHRcdFx0XHRcdHJbaV0ucmVtYWluaW5nRGlzdGFuY2VUb0Nsb3Nlc3RUYXJnZXQgPSBkO1xyXG5cdFx0XHRcdFx0XHRcdHJbaV0uY2xvc2VzdCA9IGo7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0Ly8gd2hpY2ggcm9ib3Qgd2lsbCByZWFjaCBpdCdzIHRhcmdldCBmaXJzdFxyXG5cdFx0dmFyIG5leHRSb2JvdFRvUmVhY2hUYXJnZXQgPSAtMTtcclxuXHRcdHZhciBkID0gMTAwMDAwO1xyXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGk8bjsgaSsrKSB7XHJcblx0XHRcdGlmIChyW2ldLnN0YXR1cyA9PSBcImF3YWtlXCIgJiYgcltpXS5yZW1haW5pbmdEaXN0YW5jZVRvQ2xvc2VzdFRhcmdldCA8IGQpIHtcclxuXHRcdFx0XHRkID0gcltpXS5yZW1haW5pbmdEaXN0YW5jZVRvQ2xvc2VzdFRhcmdldDsgXHJcblx0XHRcdFx0bmV4dFJvYm90VG9SZWFjaFRhcmdldCA9IGk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGlmIChkID09IDEwMDAwMCkge2JyZWFrO31cclxuXHRcdFxyXG5cdFx0Ly8gdXBkYXRlIGFjcXVpcmVkIGRpc3RhbmNlIGZvciBhbGwgYXdha2Ugcm9ib3RzXHJcblx0XHRmb3IgKHZhciBpID0gMDsgaTxuOyBpKyspIHtcclxuXHRcdFx0aWYgKHJbaV0uc3RhdHVzID09IFwiYXdha2VcIikge1xyXG5cdFx0XHRcdHJbaV0uZGlzdGFuY2VBY3F1aXJlZFNpbmNlTGFzdEp1bXAgKz0gZDtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0XHJcblx0XHQvL3Jlc2V0IHJvYm90IHRoYXQgbWFkZSB0aGUganVtcFxyXG5cdFx0cltuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0XS5kaXN0YW5jZUFjcXVpcmVkU2luY2VMYXN0SnVtcCA9IDA7XHJcblx0XHRyW25leHRSb2JvdFRvUmVhY2hUYXJnZXRdLnggPSByW3JbbmV4dFJvYm90VG9SZWFjaFRhcmdldF0uY2xvc2VzdF0ueDtcclxuXHRcdHJbbmV4dFJvYm90VG9SZWFjaFRhcmdldF0ueSA9IHJbcltuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0XS5jbG9zZXN0XS55O1xyXG5cdFx0XHJcblx0XHQvL2FkZCB0aGUgdHdvIHJvYm90cyB0byB0aGUgdGFyZ2V0IGxpc3QgaW4gbnVtZXJpY2FsIG9yZGVyXHJcblx0XHRpZiAocltuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0XS5jbG9zZXN0IDwgbmV4dFJvYm90VG9SZWFjaFRhcmdldCkge1xyXG5cdFx0XHR0YXJnZXRMaXN0LnB1c2goW3JbbmV4dFJvYm90VG9SZWFjaFRhcmdldF0uY2xvc2VzdCwgLTFdKTtcclxuXHRcdFx0dGFyZ2V0TGlzdC5wdXNoKFtuZXh0Um9ib3RUb1JlYWNoVGFyZ2V0LCAtMV0pO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdHRhcmdldExpc3QucHVzaChbbmV4dFJvYm90VG9SZWFjaFRhcmdldCwgLTFdKTtcclxuXHRcdFx0dGFyZ2V0TGlzdC5wdXNoKFtyW25leHRSb2JvdFRvUmVhY2hUYXJnZXRdLmNsb3Nlc3QsIC0xXSk7XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdC8vIHVwZGF0ZSBuZXdseSBhd2FrZW5lZCByb2JvdFxyXG5cdFx0cltyW25leHRSb2JvdFRvUmVhY2hUYXJnZXRdLmNsb3Nlc3RdLnN0YXR1cyA9IFwiYXdha2VcIjtcclxuXHRcdFxyXG5cdFx0Ly91cGRhdGUgdGhlIHRhcmdldCBsaXN0XHJcblx0XHR2YXIgdXBkYXRlZCA9IGZhbHNlO1xyXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCB0YXJnZXRMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdGlmICh0YXJnZXRMaXN0W2ldWzBdID09IG5leHRSb2JvdFRvUmVhY2hUYXJnZXQgJiYgdGFyZ2V0TGlzdFtpXVsxXSA9PSAtMSAmJiB1cGRhdGVkID09IGZhbHNlKSB7XHJcblx0XHRcdFx0dGFyZ2V0TGlzdFtpXVsxXSA9IHJbbmV4dFJvYm90VG9SZWFjaFRhcmdldF0uY2xvc2VzdDtcclxuXHRcdFx0XHR1cGRhdGVkID0gdHJ1ZTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHRcclxuXHRzID0gbmV3IEFycmF5KCk7XHJcblx0Zm9yICh2YXIgaSA9IDA7IGk8dGFyZ2V0TGlzdC5sZW5ndGg7IGkrKykge1xyXG5cdFx0cy5wdXNoKHRhcmdldExpc3RbaV1bMV0pO1xyXG5cdH1cclxuXHRyZXR1cm4gcztcclxufVxyXG5cclxuXHJcblxyXG4vKlxyXG5cclxuSSBuZXZlciBkaWQgZ2V0IHRoaXMgdG8gd29yay4gIEknbSB0YWtpbmcgaXQgb3V0IG9mIHRoZSBmaW5hbCBwcm9qZWN0LiAgSXQgdHVybnMgb3V0IHRoYXQgY2FsY3VsYXRpbmcgdGhlIG9wdGltYWxcclxuc2NoZWR1bGUgaXMgYWN0dWFsbHkgaGFyZGVyIHRoYW4gTyhuISkgYmVjYXVzZSBhdCBldmVyeSBzdGVwIGEgcm9ib3QgY2FuIHdha2UgdXAgb25lIG9mIHRoZSByZW1haW5pbmcgbiByb2JvdHMgb3IgXHJcbml0IGNhbiBzdG9wIC0gbGVhZGluZyB0byBhbiBPKChuKzEpISkgYWxnb3JpdGhtXHJcblxyXG5mdW5jdGlvbiBicnV0ZUZvcmNlU2NoZWR1bGUoKSB7XHJcblx0aWYgKG4gPiAxMCkge1xyXG5cdFx0Y29uc29sZS5sb2coXCJjb21wdXRhdGlvbmFsbHkgaW5mZWFzaWJsZVwiKTtcclxuXHRcdHJldHVybiBjb25zdGFudFNjaGVkdWxlKCk7XHJcblx0fVxyXG5cdGVsc2Uge1xyXG5cdFx0dmFyIHMgPSBuZXcgQXJyYXkoKTtcclxuXHRcdHZhciBwZXJtID0gbmV3IEFycmF5KCk7IGZvciAodmFyIGkgPSAwOyBpPG47IGkrKykge3Blcm0ucHVzaChpKTt9IGZvciAodmFyIGkgPSAwOyBpPG4vMjsgaSsrKSB7cGVybS5wdXNoKC0xKTt9XHJcblx0XHR2YXIgdSA9IG5ldyBBcnJheSgpO1xyXG5cdFx0dmFyIGYgPSBmYWN0b3JpYWwobik7XHJcblx0XHR2YXIgdCA9IDEwMDAwMDAwO1xyXG5cdFx0XHJcblx0XHR2YXIgcEdlbmVyYXRvciA9IHJlcXVpcmUoXCJwZXJtdXRhdGlvbi1yYW5rXCIpOyAgLy9odHRwczovL25wbWpzLm9yZy9wYWNrYWdlL3Blcm11dGF0aW9uLXJhbmsgdGhhbmtzIGFnYWluIE1pay5cclxuXHJcblx0XHRmb3IgKHZhciByID0gMDsgciA8IGY7IHIrKykge1x0Ly8gciBpcyB0aGUgcmFuayBvZiB0aGUgcGVybXV0YXRpb25cclxuXHRcdHUgPSBwR2VuZXJhdG9yLnVucmFuayhwZXJtLmxlbmd0aCwgcik7XHJcblx0XHRjb25zb2xlLmxvZyhyLCB1KTtcclxuXHRcdH1cclxuXHR9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZhY3RvcmlhbChudW0pIHtcdC8vaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8zOTU5MjExL2Zhc3QtZmFjdG9yaWFsLWZ1bmN0aW9uLWluLWphdmFzY3JpcHRcclxuICAgIHZhciByPTE7XHJcbiAgICBmb3IgKHZhciBpID0gMjsgaSA8PSBudW07IGkrKylcclxuICAgICAgICByID0gciAqIGk7XHJcbiAgICByZXR1cm4gcjtcclxufVxyXG4qL1xyXG5cclxuZnVuY3Rpb24gY29uc3RhbnRTY2hlZHVsZSgpIHtcclxuXHR2YXIgbnVtU2VjdG9ycyA9IDg7XHJcblx0dmFyIGR4O1xyXG5cdHZhciBkeTtcclxuXHR2YXIgaztcclxuXHR2YXIgZDtcclxuXHRcclxuXHR2YXIgcyA9IG5ldyBBcnJheSgpO1xyXG5cdHZhciByID0gbmV3IEFycmF5KCk7XHJcblx0dmFyIGMgPSBuZXcgQXJyYXkobik7XHJcblx0XHJcblxyXG5cdFxyXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSB7XHJcblx0XHRjW2ldID0gbmV3IEFycmF5KG51bVNlY3RvcnMpO1xyXG5cdFx0Zm9yICh2YXIgayA9IDA7IGsgPCBudW1TZWN0b3JzOyBrKyspIHtcclxuXHRcdFx0Y1tpXVtrXSA9IFstMSwxMjM0NTY3XTtcclxuXHRcdH1cclxuXHR9XHJcblx0XHJcblx0Ly8gbWFrZSBhIGNvcHkgb2YgdGhlIHJvYm90c1xyXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSB7XHJcblx0XHRyLnB1c2gobmV3IE9iamVjdCh7eDogcm9ib3RbaV0ueCwgeTogcm9ib3RbaV0ueSwgc3RhdHVzOiByb2JvdFtpXS5zdGF0dXMsIGQ6IDB9KSk7XHJcblx0fVxyXG5cdFxyXG5cdC8vIGMgbWF0cml4ICBob2xkcyBkYXRhIGFib3V0IGNsb3Nlc3Qgcm9ib3QgaW4gZWFjaCBvZiA4IHNlY3RvcnNcclxuXHRmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xyXG5cdFx0Zm9yICh2YXIgaiA9IDA7IGogPCBuOyBqKyspIHtcclxuXHRcdFx0aWYgKGkgIT0gaikge1xyXG5cdFx0XHRcdGR4ID0gcltqXS54IC0gcltpXS54O1xyXG5cdFx0XHRcdGR5ID0gcltqXS55IC0gcltpXS55O1xyXG5cdFx0XHRcdGsgPSAwO1xyXG5cdFx0XHRcdGlmIChkeCA8IDApIHtrICs9NDt9XHJcblx0XHRcdFx0aWYgKGR5IDwgMCkge2sgKz0yO31cclxuXHRcdFx0XHRpZiAoTWF0aC5hYnMoZHgpIDwgTWF0aC5hYnMoZHkpKSB7aysrO31cclxuXHRcdFx0XHRkID0gTWF0aC5zcXJ0KGR4KmR4K2R5KmR5KTtcclxuXHRcdFx0XHRpZiAoY1tpXVtrXVswXSA9PSAtMSB8fCBkIDwgY1tpXVtrXVsxXSkge1xyXG5cdFx0XHRcdFx0Y1tpXVtrXVswXSA9IGo7XHJcblx0XHRcdFx0XHRjW2ldW2tdWzFdID0gZDtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblx0XHJcblx0dmFyIHRhcmdldExpc3QgPSBuZXcgQXJyYXkoKTtcclxuXHR0YXJnZXRMaXN0LnB1c2goWzAsLTFdKTtcclxuXHRcclxuXHRmb3IgKHZhciB4ID0gMTsgeCA8IG47IHgrKykge1xyXG5cdFx0XHJcblx0XHQvLyB3aGljaCBhd2FrZSByb2JvdCB3aWxsIHJlYWNoIGl0cyB0YXJnZXQgZmlyc3QgYW5kIGhvdyBmYXIgYXdheSBpcyB0aGF0IHRhcmdldFxyXG5cdFx0dmFyIG5leHRSb2JvdCA9IC0xO1xyXG5cdFx0dmFyIHRhcmdldCA9IC0xO1xyXG5cdFx0dmFyIG1pbkRpc3QgPSAxMjM0NTY3O1xyXG5cdFx0XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIHtcclxuXHRcdFx0aWYgKHJbaV0uc3RhdHVzICA9PSBcImF3YWtlXCIgKSB7XHJcblx0XHRcdFx0Y29uc29sZS5sb2coIGkgKyBcIiBpcyBhd2FrZVwiKTtcclxuXHRcdFx0XHRmb3IgKHZhciBrID0gMDsgayA8IG51bVNlY3RvcnM7IGsrKykge1x0Ly8gdXBkYXRlIHN0YXR1cyBvZiByb2JvdHMgaW4gYyBtYXRyaXhcclxuXHRcdFx0XHRcdHZhciB2ID0gY1tpXVtrXVswXTtcclxuXHRcdFx0XHRcdGlmICh2ID4gLTEpIHtcclxuXHRcdFx0XHRcdFx0aWYgKHJbdl0uc3RhdHVzID09IFwiYXdha2VcIiB8fCByW3ZdLnN0YXR1cyA9PSBcInN0b3BwZWRcIikge1xyXG5cdFx0XHRcdFx0XHRcdGNbaV1ba11bMF0gPSAtMTtcdC8vIG5vIGxvbmdlciBhIHZhbGlkIHRhcmdldFxyXG5cdFx0XHRcdFx0XHRcdGNbaV1ba11bMV0gPSAxMjM0NTY3O1x0Ly8gc28gc29ydGluZyBwdXRzIHRoZXNlIGF0IHRoZSBlbmRcclxuXHRcdFx0XHRcdFx0fVx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0Y1tpXS5zb3J0KGZ1bmN0aW9uKGEsYikge3JldHVybiBhWzFdLWJbMV19KTtcclxuXHRcdFx0XHR2YXIgdCA9IGNbaV1bMF1bMF07XHQvLyBuZXh0IHRhcmdldCBpZFxyXG5cdFx0XHRcdGlmICh0ID09IC0xKSB7XHQvLyBubyB2YWxpZCB0YXJnZXRcclxuXHRcdFx0XHRcdHJbaV0uc3RhdHVzID0gXCJzdG9wcGVkXCI7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGlmIChyW2ldLnN0YXR1cyA9PSBcImF3YWtlXCIpIHtcclxuXHRcdFx0XHRcdGR4ID0gclt0XS54IC0gcltpXS54O1xyXG5cdFx0XHRcdFx0ZHkgPSByW3RdLnkgLSByW2ldLnk7XHJcblx0XHRcdFx0XHRkID0gTWF0aC5zcXJ0KGR4KmR4K2R5KmR5KSAtIHJbaV0uZDtcclxuXHRcdFx0XHRcdGlmIChkIDwgbWluRGlzdCkge1xyXG5cdFx0XHRcdFx0XHRuZXh0Um9ib3QgPSBpO1xyXG5cdFx0XHRcdFx0XHR0YXJnZXQgPSB0O1xyXG5cdFx0XHRcdFx0XHRtaW5EaXN0ID0gZDtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0Ly8gbm93IHdlIGtub3cgd2hpY2ggcm9ib3Qgd2lsbCBhd2FrZW4gd2hpY2ggdGFyZ2V0IGFuZCBob3cgZmFyIGl0IG5lZWRzIHRvIG1vdmUgdG8gZG8gdGhhdFxyXG5cdFx0Ly8gbW92ZSBhbGwgYXdha2Ugcm9ib3RzIHRoYXQgZmFyXHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xyXG5cdFx0XHRpZiAocltpXS5zdGF0dXMgPT0gXCJhd2FrZVwiKSB7XHJcblx0XHRcdFx0cltpXS5kICs9IG1pbkRpc3Q7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0Ly8gdXBkYXRlIHN0YXR1cyBvZiB3YWtlciBhbmQgdGFyZ2V0XHJcblx0XHRyW25leHRSb2JvdF0uZCA9IDA7XHJcblx0XHRyW25leHRSb2JvdF0ueCA9IHJbdGFyZ2V0XS54O1xyXG5cdFx0cltuZXh0Um9ib3RdLnkgPSByW3RhcmdldF0ueTtcclxuXHRcdHJbdGFyZ2V0XS5zdGF0dXMgPSBcImF3YWtlXCI7XHJcblx0XHRcclxuXHRcdC8vIHVwZGF0ZSB0YXJnZXQgbGlzdFxyXG5cdFx0dGFyZ2V0TGlzdC5wdXNoKFtNYXRoLm1pbihuZXh0Um9ib3QsIHRhcmdldCksLTFdKTtcclxuXHRcdHRhcmdldExpc3QucHVzaChbTWF0aC5tYXgobmV4dFJvYm90LCB0YXJnZXQpLC0xXSk7XHJcblx0XHR2YXIgdXBkYXRlZCA9IGZhbHNlO1xyXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCB0YXJnZXRMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdGlmICh0YXJnZXRMaXN0W2ldWzBdID09IG5leHRSb2JvdCAmJiB0YXJnZXRMaXN0W2ldWzFdID09IC0xICYmIHVwZGF0ZWQgPT0gZmFsc2UpIHtcclxuXHRcdFx0XHR0YXJnZXRMaXN0W2ldWzFdID0gdGFyZ2V0O1xyXG5cdFx0XHRcdHVwZGF0ZWQgPSB0cnVlO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRcclxuXHR9XHJcblx0XHJcblxyXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgdGFyZ2V0TGlzdC5sZW5ndGg7IGkrKykge1xyXG5cdFx0cy5wdXNoKHRhcmdldExpc3RbaV1bMV0pO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHM7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuIiwiLy8gdmlld3BvcnQgZGltZW5zaW9uc1xyXG52YXIgdyA9IHdpbmRvdztcclxuICAgIGQgPSBkb2N1bWVudDtcclxuICAgIGUgPSBkLmRvY3VtZW50RWxlbWVudDtcclxuICAgIGcgPSBkLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdib2R5JylbMF07XHJcbiAgICB4ID0gdy5pbm5lcldpZHRoIHx8IGUuY2xpZW50V2lkdGggfHwgZy5jbGllbnRXaWR0aDtcclxuICAgIHkgPSB3LmlubmVySGVpZ2h0fHwgZS5jbGllbnRIZWlnaHR8fCBnLmNsaWVudEhlaWdodDtcclxuXHJcbnZhciBjYW52YXNFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNjYW52YXNcIik7XHJcblxyXG5jYW52YXNFbGVtZW50LndpZHRoID0gTWF0aC5taW4oTWF0aC5taW4oeCx5KS01MCwgNzAwKTtcclxuY2FudmFzRWxlbWVudC5oZWlnaHQgPSBNYXRoLm1pbihNYXRoLm1pbih4LHkpLTUwLCA3MDApO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBjYW52YXNFbGVtZW50OyJdfQ==
;