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


















