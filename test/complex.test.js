const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../dist');

const { STRING_SORT, FORMAT_SQL } = testUtils;

describe('complex filters', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    describe(knexConfig.client, function() {
      let session, Person, Animal, Movie;

      before(function () {
        session = testUtils.initialize(knexConfig);
        Person = session.models.Person;
        Animal = session.models.Animal;
        Movie = session.models.Movie;
      });

      before(function () {
        return testUtils.dropDb(session);
      });

      before(function () {
        return testUtils.createDb(session);
      });

      before(function () {
        return testUtils.insertData(session, { persons: 10, pets: 10, movies: 10 });
      });

      describe('edge cases', function() {
        it('should do nothing with no expression', async () => {
          const result = await buildFilter(Person)
            .build();
          result.length.should.equal(10);
          result.map(item => item.firstName).should.deep.equal([
            'F00', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'
          ]);
        });

        it('should do nothing with no operator', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $invalid: 'M09'
                }
              },
              order: 'firstName'
            });
          result.length.should.equal(10);
          result.map(item => item.firstName).should.deep.equal([
            'F00', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'
          ]);
        });

        it('should be equivalent if require/where on a root model column', async () => {
          const results1 = await buildFilter(Person)
            .build({
              require: {
                firstName: 'F01'
              }
            });

          const results2 = await buildFilter(Person)
            .build({
              where: {
                firstName: 'F01'
              }
            });
          results1.should.deep.equal(results2);
        });
      });

      describe('comparative operators', function() {
        it('should search related model using full-string $like', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $like: 'M09'
                }
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F09');
        });

        it('should search related model using sub-string $like', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $like: 'M0%'
                }
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F09');
        });

        it('should search related model using $gt', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $gt: 98
                }
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F09');
        });

        it('should search related model using $lt', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $lt: 2
                }
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F00');
        });

        it('should search related model using $gte', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $gte: 99
                }
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F09');
        });

        it('should search related model using $lte', async () => {
          const result = await buildFilter(Person)
            .build({
              require: {
                'movies.id': {
                  $lte: 3
                }
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F00');
        });


        it('should search related model using $exists', async () => {
          const result = await buildFilter(Person)
            .build({
              require: {
                'movies.code': {
                  $exists: true
                }
              },
              order: 'firstName'
            });
          result.length.should.equal(5);
          result.map(item => item.firstName).should.deep.equal([
            'F05', 'F06', 'F07', 'F08', 'F09'
          ]);
        });

        it('should search related model using !$exists', async () => {
          const result = await buildFilter(Person)
            .build({
              require: {
                'movies.code': {
                  $exists: false
                }
              },
              order: 'firstName'
            });
          result.length.should.equal(5);
          result.map(item => item.firstName).should.deep.equal([
            'F00', 'F01', 'F02', 'F03', 'F04'
          ]);
        });

        it('should search related model using explicit $equals', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $equals: 98
                }
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F09');
        });

        it('should search related model using explicit `=`', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  '=': 98
                }
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F09');
        });

        it('should search related model using $in', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $in: [88, 98]
                }
              },
              order: 'firstName'
            });
          result.length.should.equal(2);
          result.map(item => item.firstName).should.deep.equal([
            'F08', 'F09'
          ]);
        });
      });

      describe('logical operators', function() {
        it('should search root model using `require $or $like`', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $or: [
                    { $like: 'M99' },
                    { $like: 'M89' }
                  ]
                }
              }
            });
          result.map(item => item.firstName).sort(STRING_SORT).should.deep.equal([
            'F00', 'F01'
          ]);
        });

        it('should search root model using `require $or` and different comparators', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $or: [
                    { $like: 'M99' },
                    { $equals: 'M89' }
                  ]
                }
              }
            });
          result.map(item => item.firstName).sort(STRING_SORT).should.deep.equal([
            'F00', 'F01'
          ]);
        });

        it('should search root model using `require $or` and operand values', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $or: [
                    'M99',
                    'M89'
                  ]
                }
              }
            });
          result.map(item => item.firstName).sort(STRING_SORT).should.deep.equal([
            'F00', 'F01'
          ]);
        });

        it('should search root model using `require $or` and no values', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $or: []
                }
              },
              order: 'firstName'
            });
          result.map(item => item.firstName).should.deep.equal([
            'F00', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'
          ]);
        });
      });

      describe('filter combinations', function() {
        it('should `require` and `where` on the same relation', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              where: {
                'movies.name': 'M09'
              },
              require: {
                'movies.name': 'M09'
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F09');
          person.movies.should.be.an('array');
          person.movies.length.should.equal(1);
          person.movies[0].name.should.equal('M09');
        });

        it('should `require` and `where` on different relations', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'pets',
              require: {
                'movies.name': 'M09'
              },
              where: {
                'pets.name': 'P90'
              }
            });
          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F09');
          person.pets.should.be.an('array');
          person.pets.length.should.equal(1);
          person.pets[0].name.should.equal('P90');
        });
      });

      describe('optimization', function () {
        context('given require filter is purely belongsTo', () => {
          let query;
          beforeEach(() => {
            query = buildFilter(Animal)
              .build({
                require: {
                  'owner.firstName': 'F00'
                },
                eager: 'owner'
              });
          });

          it('should return base model results', async () => {
            const result = await query;
            result.length.should.equal(10);
            result.map(animal => animal.owner.firstName.should.equal('F00'));
          });

          it('should generate SQL without filter inner join', () => {
            const { sql } = query.toKnexQuery().toSQL();
            FORMAT_SQL(sql).should.equal(
              'select `Animal`.* from `Animal` inner join `Person` as `owner` on `owner`.`id` = `Animal`.`ownerId` where (`owner`.`firstName` = ?)'
            );
          });
        });

        context('given require filter is not purely belongsTo', () => {
          it('should return base model results', async () => {
            const result = await buildFilter(Person)
              .build({
                require: {
                  'pets.name': 'P00'
                }
              });
            result.length.should.equal(1);
            const person = result[0];
            person.firstName.should.equal('F00');
          });
        });

        context('given eager filter is purely belongsTo', () => {
          it('should return base model results', async () => {
            const result = await buildFilter(Animal)
              .build({
                eager: {
                  $where: {
                    'owner.firstName': 'F00'
                  },
                  owner: true
                }
              });
            result.length.should.equal(10);
            result.map(animal => animal.owner.firstName.should.equal('F00'));
          });
        });

        context('given eager filter is not purely belongsTo', () => {
          it('should return base model results', async () => {
            const result = await buildFilter(Person)
              .build({
                eager: {
                  $where: {
                    'pets.name': 'P00'
                  }
                }
              });
            result.length.should.equal(1);
            const person = result[0];
            person.firstName.should.equal('F00');
          });
        });

        context('given require filter is purely belongsToOne', () => {
          let query;
          beforeEach(() => {
            query = buildFilter(Person)
            .build({
              require: {
                'parent.firstName': 'F01'
              }
            });
          });

          it('should return base model results', async () => {
            const result = await query;
            result.length.should.equal(1);
            result[0].firstName.should.equal('F02');
          });

          it('should generate SQL without filter inner join', () => {
            const { sql } = query.toKnexQuery().toSQL();
            FORMAT_SQL(sql).should.equal(
              'select `Person`.* from `Person` inner join `Person` as `parent` on `parent`.`id` = `Person`.`pid` where (`parent`.`firstName` = ?)'
            );
          });
        });

        context('given require filter is purely hasOne', () => {
          let query;
          beforeEach(() => {
            query = buildFilter(Movie)
            .build({
              require: {
                'version.version': 1
              }
            });
          });

          it('should return base model results', async () => {
            const result = await query;
            result.length.should.equal(100);
          });

          it('should generate SQL without filter inner join', () => {
            const { sql } = query.toKnexQuery().toSQL();
            FORMAT_SQL(sql).should.equal(
              'select `Movie`.* from `Movie` inner join `Movie_Version` as `version` on `version`.`movieId` = `Movie`.`id` where (`version`.`version` = ?)'
            );
          });
        });
      })
    });
  });
});
