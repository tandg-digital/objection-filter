'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('basic filters', function () {

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

      describe('filter attributes', function() {
        it('should limit', done => {
          buildFilter(Person)
            .build({
              limit: 1
            })
            .then(result => {
              result.should.be.an.an('array')
              result.should.have.length(1);
              done();
            })
            .catch(done);
        });

        it('should offset', done => {
          buildFilter(Person)
            .build({
              limit: 1,
              offset: 1
            })
            .then(result => {
              result.should.be.an.an('array')
              result.should.have.length(1);
              result[0].firstName.should.equal('F01');
              done();
            })
            .catch(done);
        });

        it('should select limited fields', done => {
          buildFilter(Person)
            .build({
              limit: 1,
              fields: ['id']
            })
            .then(result => {
              result.should.be.an.an('array')
              result.should.have.length(1);
              _.keys(result[0]).should.deep.equal(['id']);
              done();
            })
            .catch(done);
        });

        it('should order by descending', done => {
          buildFilter(Person)
            .build({
              order: 'id desc'
            })
            .then(result => {
              result.should.be.an.an('array')
              result.map(item => item.id).should.deep.equal([
                10,9,8,7,6,5,4,3,2,1
              ]);
              done();
            })
            .catch(done);
        });

        it('should order by ascending', done => {
          buildFilter(Person)
            .build({
              order: 'id asc'
            })
            .then(result => {
              result.should.be.an.an('array')
              result.map(item => item.id).should.deep.equal([
                1,2,3,4,5,6,7,8,9,10
              ]);
              done();
            })
            .catch(done);
        });
      });

      describe('eager loaded data', function() {
        it('should include eagerly loaded data', done => {
          buildFilter(Person)
            .build({
              eager: 'movies'
            })
            .then(result => {
              result.should.be.an.an('array')
              _.forEach(person => person.movies.should.be.an.array);
              done();
            })
            .catch(done);
        });

        it('should only select some fields on eagerly loaded models', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              fields: ['movies.id']
            })
            .then(result => {
              _.forEach(result, person => {
                _.forEach(person.movies, movie => {
                  _.keys(movie).should.deep.equal(['id']);
                })
              })
              done();
            })
            .catch(done);
        });

        it('should filter the root model', done => {
          buildFilter(Person)
            .build({
              where: {
                firstName: 'F00'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              result[0].firstName.should.equal('F00');
              done();
            })
            .catch(done);
        });

        it('should filter eagerly loaded data using `where in`', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              where: {
                'movies.name': 'M99'
              }
            })
            .then(result => {
              result.length.should.equal(10); // Should inclue all root models regardless of condition
              _.forEach(result, person => {
                person.movies.forEach(movie => {
                  movie.name.should.equal('M99');
                });
              })
              done();
            })
            .catch(done);
        });

        it('should filter eagerly loaded data using `join`', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': 'M99'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              result[0].firstName.should.equal('F00');
              done();
            })
            .catch(done);
        });

        it('should order eagerly loaded model', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              order: 'movies.id asc',
              limit: 1
            })
            .then(result => {
              result.should.be.an.an('array')
              result.forEach(person => {
                [].concat(person.movies.map(movie => movie.id)).sort((a,b) => a > b)
                  .should.deep.equal(
                    person.movies.map(movie => movie.id)
                  );
              });
              done();
            })
            .catch(done);
        });

        it('should order eagerly loaded model descending', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              order: 'movies.id desc',
              limit: 1
            })
            .then(result => {
              result.should.be.an.an('array')
              result.forEach(person => {
                [].concat(person.movies.map(movie => movie.id)).sort((a,b) => a < b)
                  .should.deep.equal(
                    person.movies.map(movie => movie.id)
                  );
              });
              done();
            })
            .catch(done);
        });
      });

      describe('controls and errors', function() {
        it('should limit eager expressions', done => {
          buildFilter(Person)
            .allowEager('pets')
            .build({
              eager: 'movies'
            })
            .then(result => {
              done(new Error('Eager expression should not be allowed'));
            })
            .catch(err => {
              err.statusCode.should.equal(400);
              done();
            });
        });
      });
    });
  });
});