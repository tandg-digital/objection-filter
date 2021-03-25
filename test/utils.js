const _ = require('lodash');
const os = require('os');
const path = require('path');
const Knex = require('knex');
const Promise = require('bluebird');
const objection = require('objection');
const pg = require('pg');

pg.types.setTypeParser(1700, 'text', parseFloat); // DECIMAL
pg.types.setTypeParser(20, 'text', parseInt); // BIGINT
const getNumber = s => parseInt(s.replace(/^\D*/, ''), 10);

module.exports = {
  testDatabaseConfigs: [{
    client: 'sqlite3',
    connection: {
      filename: path.join(os.tmpdir(), 'objection_find_test.db')
    },
    useNullAsDefault: true
  }, {
    client: 'postgres',
    connection: {
      host: '127.0.0.1',
      database: 'objection_filter_test'
    },
    pool: {
      min: 0,
      max: 10
    }
  }, {
    client: 'mysql',
    connection: {
      host: '127.0.0.1',
      user: 'travis',
      database: 'objection_filter_test'
    },
    pool: {
      min: 0,
      max: 10
    }
  }],

  NUMERIC_SORT: (a, b) => a - b,
  STRING_SORT: (a, b) => getNumber(a) - getNumber(b),
  FORMAT_SQL: (sql) => sql.replace(/"/g, '`'),

  initialize: function (knexConfig) {
    const knex = Knex(knexConfig);
    return {
      config: knexConfig,
      models: createModels(knex),
      knex: knex
    };
  },

  dropDb: function (session) {
    return session.knex.schema
      .dropTableIfExists('Movie_Version')
      .dropTableIfExists('Person_Movie')
      .dropTableIfExists('Movie')
      .dropTableIfExists('Category')
      .dropTableIfExists('Animal')
      .dropTableIfExists('Person');
  },

  createDb: function (session) {
    return session.knex.schema
      .createTable('Person', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.integer('age');
        table.biginteger('pid').unsigned().references('Person.id').index();
        table.string('firstName');
        table.string('lastName');
        table.string('nickName');
      })
      .createTable('Category', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.string('name').index();
      })
      .createTable('Animal', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.biginteger('ownerId').unsigned().references('Person.id').index();
        table.string('name').index();
      })
      .createTable('Movie', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.biginteger('categoryId').unsigned().references('Category.id').index();
        table.string('name').index();
        table.string('code');
        table.integer('seq').index();
      })
      .createTable('Person_Movie', function (table) {
        table.bigincrements('id').unsigned().primary();
        table.biginteger('actorId').unsigned().references('Person.id').index();
        table.biginteger('movieId').unsigned().references('Movie.id').index();
      })
      .createTable('Movie_Version', function (table) {
        table.biginteger('movieId').unsigned().references('Movie.id').index();
        table.integer('version').index();
        table.unique(['movieId', 'version']);
      })
      .then(function () {
        if (session.config.client === 'postgres') {
          // Index to speed up wildcard searches.
          return Promise.join(
            session.knex.raw('CREATE INDEX "movie_name_wildcard_index" ON "Movie" USING btree ("name" varchar_pattern_ops)'),
            session.knex.raw('CREATE INDEX "animal_name_wildcard_index" ON "Animal" USING btree ("name" varchar_pattern_ops)')
          );
        }
      });
  },

  /**
   * Insert the test data.
   *
   * 10 Persons with names `F00 L09`, `F01 L08`, ...
   *   The previous person is the parent of the next one (the first person doesn't have a parent).
   *
   *   Each person has 10 Pets `P00`, `P01`, `P02`, ...
   *     First person has pets 0 - 9, second 10 - 19 etc.
   *
   *   Each person is an actor in 10 Movies `M00`, `M01`, `M02`, ...
   *     First person has movies 0 - 9, second 10 - 19 etc.
   *
   *   Each movie has a category C00 to C90 (i.e. 10 categories)
   *
   * name    | parent  | pets      | movies     | category
   * --------+---------+-----------+------------+----------
   * F00 L09 | null    | P00 - P09 | M99 - M90  | C00
   * F01 L08 | F00 L09 | P10 - P19 | M89 - M80  | C01
   * F02 L07 | F01 L08 | P20 - P29 | M79 - M79  | C02
   * F03 L06 | F02 L07 | P30 - P39 | M69 - M60  | C03
   * F04 L05 | F03 L06 | P40 - P49 | M59 - M50  | C04
   * F05 L04 | F04 L05 | P50 - P59 | M49 - M40  | C05
   * F06 L03 | F05 L04 | P60 - P69 | M39 - M30  | C06
   * F07 L02 | F06 L03 | P70 - P79 | M29 - M20  | C07
   * F08 L01 | F07 L02 | P80 - P89 | M19 - M10  | C08
   * F09 L00 | F08 L01 | P90 - P99 | M09 - M00  | C09
   */
  insertData: function (session, counts, progress) {
    progress = progress || _.noop;

    const C = 30;
    const P = counts.persons;
    const A = counts.pets;
    const M = counts.movies;
    const zeroPad = createZeroPad(Math.max(P * A, P * M));

    const persons = _.times(P, function (p) {
      return session.models.Person.fromJson({
        id: p + 1,
        firstName: 'F' + zeroPad(p),
        lastName: 'L' + zeroPad(P - p - 1),
        age: p * 10,
        nickName: p <= 4 ? null : ('N' + zeroPad(p)),

        category: {
          id: p + 1,
          name: 'C' + zeroPad(p)
        },

        pets: _.times(A, function (a) {
          const id = p * A + a + 1;
          return { id: id, name: 'P' + zeroPad(id - 1), ownerId: p + 1 };
        }),

        movies: _.times(M, function (m) {
          const id = p * M + m + 1;
          return {
            id: id,
            categoryId: p + 1,
            name: 'M' + zeroPad(P * M - id),
            code: p <= 4 ? null : ('C' + zeroPad(p)),
            seq: Math.floor(Math.random() * 20)
          };
        }),

        movieVersions: _.times(M, function (m) {
          const id = p * M + m + 1;
          return {
            movieId: id,
            version: 1
          };
        }),

        personMovies: _.times(M, function (m) {
          const id = p * M + m + 1;
          return { actorId: p + 1, movieId: id };
        })
      });
    });

    return Promise.all(_.map(_.chunk(persons, C), function (personChunk) {
      return session.knex('Person').insert(pick(personChunk, ['id', 'firstName', 'lastName', 'age', 'nickName']));
    })).then(function() {
      return Promise.all(_.map(_.chunk(persons, C), function (personChunk) {
        return session.knex('Category').insert(
          pick(personChunk, 'category').map(item => item.category)
        );
      }));
    }).then(function () {
      return session.knex('Person').update('pid', session.knex.raw('id - 1')).where('id', '>', 1);
    }).then(function () {
      progress('1/5');
      return Promise.all(_.map(_.chunk(_.flatten(_.map(persons, 'pets')), C), function (animalChunk) {
        return session.knex('Animal').insert(animalChunk);
      }));
    }).then(function () {
      progress('2/5');
      return Promise.all(_.map(_.chunk(_.flatten(_.map(persons, 'movies')), C), function (movieChunk) {
        return session.knex('Movie').insert(movieChunk);
      }));
    }).then(function () {
      progress('3/5');
      return Promise.all(_.map(_.chunk(_.flatten(_.map(persons, 'personMovies')), C), function (movieChunk) {
        return session.knex('Person_Movie').insert(movieChunk);
      }));
    }).then(function () {
      progress('4/5');
      return Promise.all(_.map(_.chunk(_.flatten(_.map(persons, 'movieVersions')), C), function (movieVersionChunk) {
        return session.knex('Movie_Version').insert(movieVersionChunk);
      }));
    }).then(function () {
      progress('5/5');
    });
  }
};

function createModels(knex) {
  class Person extends objection.Model {
    static get tableName() {
      return 'Person';
    }

    static get relationMappings() {
      return {
        parent: {
          relation: objection.BelongsToOneRelation,
          modelClass: Person,
          join: {
            from: 'Person.pid',
            to: 'Person.id'
          }
        },

        pets: {
          relation: objection.HasManyRelation,
          modelClass: Animal,
          join: {
            from: 'Person.id',
            to: 'Animal.ownerId'
          }
        },

        movies: {
          relation: objection.ManyToManyRelation,
          modelClass: Movie,
          join: {
            from: 'Person.id',
            through: {
              from: 'Person_Movie.actorId',
              to: 'Person_Movie.movieId'
            },
            to: 'Movie.id'
          }
        }
      };
    }
  }

  class Animal extends objection.Model {
    static get tableName() {
      return 'Animal';
    }

    static get relationMappings() {
      return {
        owner: {
          relation: objection.BelongsToOneRelation,
          modelClass: Person,
          join: {
            from: 'Animal.ownerId',
            to: 'Person.id'
          }
        }
      };
    }
  }

  class Movie extends objection.Model {
    static get tableName() {
      return 'Movie';
    }

    static get relationMappings() {
      return {
        category: {
          relation: objection.BelongsToOneRelation,
          modelClass: Category,
          join: {
            from: 'Movie.categoryId',
            to: 'Category.id'
          }
        },

        version: {
          relation: objection.HasOneRelation,
          modelClass: MovieVersion,
          join: {
            from: 'Movie.id',
            to: 'Movie_Version.movieId'
          }
        }
      };
    }
  }

  class Category extends objection.Model {
    static get tableName() {
      return 'Category';
    }
  }

  class MovieVersion extends objection.Model {
    static get idColumn() {
      return ['movieId', 'version'];
    }

    static get tableName() {
      return 'Movie_Version';
    }

    static get relationMappings() {
      return {
        movie: {
          relation: objection.HasOneRelation,
          modelClass: Movie,
          join: {
            from: 'Movie_Version.movieId',
            to: 'Movie.id'
          }
        }
      };
    }
  }

  Person.knex(knex);
  Animal.knex(knex);
  Movie.knex(knex);
  Category.knex(knex);
  MovieVersion.knex(knex);

  return {
    Person: Person,
    Animal: Animal,
    Movie: Movie,
    Category: Category,
    MovieVersion: MovieVersion
  };
}

function createZeroPad(N) {
  // log(x) / log(10) == log10(x)
  const n = Math.ceil(Math.log(N) / Math.log(10));

  return function (num) {
    num = num.toString();

    while (num.length < n) {
      num = '0' + num;
    }

    return num;
  };
}

function pick(arr, picks) {
  return _.map(arr, function (obj) {
    return _.pick(obj, picks);
  });
}
