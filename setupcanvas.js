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