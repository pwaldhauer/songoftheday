var moment = require('moment');
var _ = require('underscore');
var fs = require('fs');
var ejs = require('ejs');

var LastFmNode = require('lastfm').LastFmNode;

var config = require(__dirname + '/config');

var lastfm = new LastFmNode({
  api_key: config.key,
  secret: config.secret
});

var db = {'last_check': 0, 'database': {}};
if(fs.existsSync(__dirname + '/data.json')) {
  db = require(__dirname + '/data');
}

console.log('Updating data file');
console.log('Last scan: ' + db.last_check);

if(process.argv[2] == 'load') {
    get_songs(config.user, db.database, db.last_check, 1, function(is_last_page) {

    if(is_last_page) {
      db.last_check = parseInt((new Date()).getTime() / 1000);
      fs.writeFileSync(__dirname + '/data.json', JSON.stringify(db));

      console.log('Done!');
    }
  });
} else {
    console.log('Render template');
    render_template(db);
}

function render_template(db) {
    var data = [];

    var map = _.map(db.database, function(tracks, day) {
        var dict = {};

        _.each(tracks, function(track) {
            if(!dict[track.title]) {
                dict[track.title] = {
                    track: track,
                    count: 0,
                }
            }

            dict[track.title].count++;
        });

        return {day: day, dict: dict};
    });

    _.each(map, function(day) {
        var top_track = _.reduce(day.dict, function(memo, track) {
            return (track.count > memo.count) ? track : memo;
        }, {count: 0});

        var date = moment.unix(top_track.track.date).format('dddd, DD. MMMM');
        var sum = _.reduce(day.dict, function(memo, track){ return memo + track.count; }, 0);

        data.push({date: date, top_track: top_track, sum: sum});
    })

    data = data.reverse();

    var template = String(fs.readFileSync('template.html'));
    fs.writeFileSync('index.html', ejs.render(template, {data: data}));
}

function get_songs(user, database, last_check, current_page, cb) {
  lastfm.request('user.getRecentTracks', {
      user: user,
      from: db.last_check,
      page: current_page,
      limit: 200,
      handlers: {
          success: function(data) {
            if(_.isUndefined(data.recenttracks['@attr'])) {
              console.log('Possible error: ', data);
              return cb(true, 0);
            }

            var pages = data.recenttracks['@attr'].totalPages;
            console.log('Current page: %d, pages: %d', current_page, pages);

            for(var i in data.recenttracks.track) {
              var track = data.recenttracks.track[i];

              if(!track.date) {
                continue;
              }

              var ymd = moment.unix(track.date['uts']).format('YYMMDD');

              if(!database.hasOwnProperty(ymd)) {
                database[ymd] = [];
              }

              database[ymd].push(track_from_track(track));
            }

            cb(current_page == pages);

            if(current_page != pages) {
              get_songs(user, database, last_check, current_page + 1, cb);
            }
          }
      }
  });
}

function track_from_track(track) {
    return {
        artist: track['artist']['#text'],
        title: track['name'],
        album: track['album']['#text'],
        date: track['date']['uts']
    }
}
