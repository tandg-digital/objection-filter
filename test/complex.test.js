'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('complex filters', function () {

  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {

    describe(knexConfig.client, function() {
      var session, knex, Person, Animal, Movie;

      before(function () {
        session = testUtils.initialize(knexConfig);
        knex = session.knex;
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
       * name    | parent  | pets      | movies
       * --------+---------+-----------+----------
       * F00 L09 | null    | P00 - P09 | M99 - M90
       * F01 L08 | F00 L09 | P10 - P19 | M89 - M80
       * F02 L07 | F01 L08 | P20 - P29 | M79 - M79
       * F03 L06 | F02 L07 | P30 - P39 | M69 - M60
       * F04 L05 | F03 L06 | P40 - P49 | M59 - M50
       * F05 L04 | F04 L05 | P50 - P59 | M49 - M40
       * F06 L03 | F05 L04 | P60 - P69 | M39 - M30
       * F07 L02 | F06 L03 | P70 - P79 | M29 - M20
       * F08 L01 | F07 L02 | P80 - P89 | M19 - M10
       * F09 L00 | F08 L01 | P90 - P99 | M09 - M00
       */
      before(function () {
        return testUtils.insertData(session, {persons: 10, pets: 10, movies: 10});
      });

      describe('edge cases', function() {
        it('should do nothing with no expression', done => {
          buildFilter(Person)
            .build()
            .then(result => {
              result.length.should.equal(10);
              result.map(item => item.firstName).should.deep.equal([
                'F00','F01','F02','F03','F04','F05','F06','F07','F08','F09'
              ]);
              done();
            })
            .catch(done);
        });

        it('should do nothing with no operator', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $invalid: 'M09'
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              result.map(item => item.firstName).should.deep.equal([
                'F00','F01','F02','F03','F04','F05','F06','F07','F08','F09'
              ]);
              done();
            })
            .catch(done);
        });
      });

      describe('comparative operators', function() {
        it('should search related model using full-string $like', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $like: 'M09'
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using sub-string $like', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $like: 'M0%'
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using $gt', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $gt: 98
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using $lt', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $lt: 2
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F00');
              done();
            })
            .catch(done);
        });

        it('should search related model using $gte', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $gte: 99
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using $lte', done => {
          buildFilter(Person)
            .build({
              require: {
                'movies.id': {
                  $lte: 3
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F00')
              done();
            })
            .catch(done);
        });


        it('should search related model using $exists', done => {
          buildFilter(Person)
            .build({
              require: {
                'movies.code': {
                  $exists: true
                }
              }
            })
            .then(result => {
              result.length.should.equal(5);
              result.map(item => item.firstName).should.deep.equal([
                'F05','F06','F07','F08','F09'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search related model using explicit $equals', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $equals: 98
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using $in', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $in: [ 88, 98 ]
                }
              }
            })
            .then(result => {
              result.length.should.equal(2);
              result.map(item => item.firstName).should.deep.equal([
                'F08', 'F09'
              ]);
              done();
            })
            .catch(done);
        });
      });

      describe('logical operators', function() {
        it('should search root model using `require $or $like`', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  '$or': [
                    { '$like': 'M99' },
                    { '$like': 'M89'}
                  ]
                }
              }
            })
            .then(result => {
              result.map(item => item.firstName).should.deep.equal([
                'F00', 'F01'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search root model using `require $or` and different comparators', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  '$or': [
                    { '$like': 'M99' },
                    { '$equals': 'M89'}
                  ]
                }
              }
            })
            .then(result => {
              result.map(item => item.firstName).should.deep.equal([
                'F00', 'F01'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search root model using `require $or` and operand values', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  '$or': [
                    'M99',
                    'M89'
                  ]
                }
              }
            })
            .then(result => {
              result.map(item => item.firstName).should.deep.equal([
                'F01', 'F00'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search root model using `require $or` and no values', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  '$or': []
                }
              }
            })
            .then(result => {
              result.map(item => item.firstName).should.deep.equal([
                'F00', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'
              ]);
              done();
            })
            .catch(done);
        });
      });

      describe('filter combinations', function() {
        it('should `require` and `where` on the same relation', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              where: {
               'movies.name': 'M09'
              },
              require: {
                'movies.name': 'M09'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              person.movies.should.be.an('array');
              person.movies.length.should.equal(1);
              person.movies[0].name.should.equal('M09');
              done();
            })
            .catch(done);
        });

        it('should `require` and `where` on different relations', done => {
          buildFilter(Person)
            .build({
              eager: 'pets',
              require: {
                'movies.name': 'M09'
              },
              where: {
                'pets.name': 'P90'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              person.pets.should.be.an('array');
              person.pets.length.should.equal(1);
              person.pets[0].name.should.equal('P90');
              done();
            })
            .catch(done);
        });

        it('should be equivalent with `require` and `where` on base model', () => {
          const requireQuery = buildFilter(Person)
            .build({
              require: {
                firstName: 'F09'
              }
            });

          const whereQuery = buildFilter(Person)
            .build({
              where: {
                firstName: 'F09'
              }
            });

          requireQuery.toSql().should.equal(whereQuery.toSql());
        });
      });
    });
  });
});