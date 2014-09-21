var app = angular.module('app', ['ngRoute', 'ui.bootstrap','ui.bootstrap.collapse', 'LocalForageModule']);
app.controller('TrainerController', function($scope, $http, metronome, statistics){
    $http.get('kick.wav', {responseType: 'arraybuffer'}).success(function(data){
        metronome.setSample(data);
    });
    function addStats(){
        if(!started) return;
        var end = moment(),
            record = {
                start: started.toJSON(),
                end: end.toJSON(),
                duration: end.diff(started, 'seconds'),
                bpm: $scope.bpm
            };
        if(record.duration){
            statistics.then(function(stats){
                stats.data.metronome.push(record);
                stats.save();
            });
        }
        if(metronome.playing){
            started = moment();
        }
        else {
            started = null;
        }
    }
    $scope.metronome = metronome;
    $scope.$watch('bpm', _.debounce(function(value){
        addStats();
        metronome.bpm(value);
    }, 100));
    var started = null;
    $scope.$watch('metronome.playing', function(playing){
        if(playing){
            started = moment();
        }
        else {
            addStats();
        }
    });
    $scope.bpm = 80;
});
app.directive('visualizer', function(audioCtx){
    return {
        scope: {
            metronome: '=visualizerMetronome'
        },
        link: function($scope, element, attrs){
            var canvas = element[0],
                ctx = canvas.getContext('2d');
            canvas.width = element.width();
            canvas.height = element.height();
            $scope.$watch('metronome.playing', function(playing){
                if(playing){
                    render();
                }
            });
            function render(){
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                var metronome = $scope.metronome,
                    timeWindow = 10.0,
                    now = 0.75,
                    latency = 0.0,
                    bpm = metronome.bpm(),
                    tickPeriod = 60/bpm,
                    tickPhase = metronome.started%tickPeriod,
                    t0 = audioCtx.currentTime - timeWindow*now,
                    t = -(t0%tickPeriod)+tickPhase-latency,
                    timeToPosition = 1/timeWindow*canvas.width,
                    height = canvas.height,
                    x;
                if(!metronome.playing) return;
                ctx.fillStyle = '#f00';
                while(t < timeWindow){
                    ctx.fillRect(t*timeToPosition, 0, 1, canvas.height);
                    t+=tickPeriod;
                }
                var nowX = canvas.width*now;
                ctx.fillStyle = '#00f';
                ctx.beginPath();
                ctx.moveTo(nowX-20, 0);
                ctx.lineTo(nowX, 20);
                ctx.lineTo(nowX+20, 0);
                ctx.fill();

                requestAnimationFrame(render);
            }
        }
    };
});
app.factory('metronome', function(audioCtx, $interval){
    var bpm = 60,
        sampleBuffer = null,
        loopBuffer = null,
        gainNode = audioCtx.createGain(),
        source = null,
        metronome = {
            play: function(){
                this.playing = true;
                if(!source && sampleBuffer){
                    source = audioCtx.createBufferSource();
                    source.loop = true;
                    source.buffer = loopBuffer;
                    source.connect(gainNode);
                    this.started = audioCtx.currentTime;
                    source.start(this.started);
                }

            },
            pause: function(){
                this.playing = false;
                if(source){
                    source.stop();
                    source = null;
                }
            },
            volume: function(value){
                if(value !== undefined){
                    gainNode.gain.value = value;
                }
                return gainNode.gain.value;
            },
            setSample: function(value){
                audioCtx.decodeAudioData(value, function(buffer){
                    sampleBuffer = buffer;
                    updateLoopBuffer();
                });
            },
            bpm: function (value) {
                if(value !== undefined && bpm != value){
                    bpm = value;
                    updateLoopBuffer();
                }
                return bpm;
            },
            playing: false,
            started: 0.0
        };

    function updateLoopBuffer(){
        var wasPlaying = metronome.playing;
        metronome.pause();
        if(sampleBuffer) {
            loopBuffer = makeLoopBuffer(audioCtx, sampleBuffer, 60.0/bpm, 4);
        }
        if(wasPlaying) {
            metronome.play();
        }
    }

    function makeLoopBuffer(audioCtx, sample, duration, accent){
        var sampleRate = sample.sampleRate,
            samplesPerTick = ~~(sampleRate*duration),
            samples = samplesPerTick*accent,
            loop = audioCtx.createBuffer(1, samples, sampleRate),
            sampleData = sample.getChannelData(0),
            loopData = loop.getChannelData(0);
        for(var i = 0; i < samples; i++) {
            var j = i%samplesPerTick,
                accent = i < samplesPerTick,
                gain = accent ? 1.0 : 0.25;
            if(j < sampleData.length) {
                loopData[i] = sampleData[j]*gain;
            }
        }
        return loop;
    }
    gainNode.connect(audioCtx.destination);
    return metronome;
});
app.controller('NotesController', function($scope, $localForage){
    $localForage.bind($scope, 'notes');
});
app.controller('StatsController', function($scope, statistics){
    statistics.then(function(stats){
        $scope.data = stats.data;
        $scope.timeRange = 7;
        $scope.chartOptions = {
            axisY: {
                labelInterpolationFnc: function(value) {
                    var s = '';
                    if(value > 60) {
                        s = Math.round(value/60) + ' min ';
                    }
                    if(s === '' || Math.round(value%60) > 0) {
                        s += Math.round(value%60) + ' sec';
                    }
                    return s;
                }
            }
        };
        $scope.$watch('timeRange', update);
        $scope.$watch('data', update, true);
        function update(){
            var now = moment(),
                timeRange = $scope.timeRange,
                records = _.filter($scope.data.metronome, function(record){
                    return (now.diff(record.start, 'days') < timeRange);
                }),
                byDay = _.groupBy(records, function(r){ return r.start.slice(0, 10); }),
                byDayLabels = _.keys(byDay).sort(),
                byTempo = _.groupBy(records, 'bpm'),
                byTempoLabels = _.keys(byTempo).sort(function(a,b){ return a-b; });
            $scope.timeSpent = {
                labels: byDayLabels,
                series: [
                    byDayLabels.map(function(day){
                        return _.reduce(byDay[day], function(s,r){ return s+r.duration; }, 0);
                    })
                ]
            };
            $scope.tempoHistogram = {
                labels: byTempoLabels,
                series: [
                    byTempoLabels.map(function(bpm){
                        return _.reduce(byTempo[bpm], function(s,r){ return s+r.duration; }, 0);
                    })
                ]
            };
            $scope.averageTempo = {
                labels: byDayLabels,
                series: [
                    byDayLabels.map(function(day){
                        return _.reduce(byDay[day], function(s,r){ return s+r.bpm*r.duration; }, 0)/_.reduce(byDay[day], function(s,r){ return s+r.duration; }, 0);
                    })
                ]
            };
        }
    });
});
app.config(['$localForageProvider', function($localForageProvider){
    $localForageProvider.config({
        name: 'rhythmTrainer'
    });
}]);
app.config(['$routeProvider', function($routeProvider) {
        $routeProvider
            .when('/', {
                templateUrl: 'templates/trainer.html',
                controller: 'TrainerController'
            })
            .when('/tuner', {
                templateUrl: 'templates/tuner.html',
                //controller: 'MetronomeController'
            })
            .when('/statistics', {
                templateUrl: 'templates/statistics.html',
                controller: 'StatsController'
            })
            .when('/notes', {
                templateUrl: 'templates/notes.html',
                controller: 'NotesController'
            })
            .when('/about', {
                templateUrl: 'templates/about.html',
                //controller: 'PhoneDetailCtrl'
            })
            .otherwise({redirect: '/'});
}]);
app.directive('chart', function(){
    return {
        scope: {
            data: '=chart',
            options: '=chartOptions'
        },
        link: function($scope, element, attrs){
            var chart;
            $scope.$watch('data', update, true);
            function update(data){
                if(!data) return;
                chart = Chartist[attrs.chartType||'Line'](element[0], $scope.data, $scope.options);
            }
            
        }
    };
});
app.factory('statistics', function($localForage){
    var data = {
        metronome: []
    };
    return $localForage.getItem('stats').then(function(storedData){
        if(storedData != null) {
            data = storedData;
        }
        return {
            data: data,
            save: function(){
                $localForage.setItem('stats', data);
            }
        };
    });
});
app.directive('navigation', function($location){
    return {
        scope: {},
        controller: function($scope){
            $scope.navigation = [
                {text: 'Metronome', href:'/'},
                {text: 'Tuner', href:'/tuner'},
                {text: 'Statistics', href:'/statistics'},
                //{text: 'Settings', href:'/settings'},
                {text: 'Notes', href:'/notes'},
                {text: 'About', href:'/about'}
            ];
            $scope.navbarCollapsed = true;
            $scope.isActive = function(item) { return item.href === $location.path(); };
        },
        templateUrl: 'templates/navigation.html'
    };
});

