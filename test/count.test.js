'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('count queries', function () {

  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {

    describe(knexConfig.client, function () {
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
        return testUtils.insertData(session, { persons: 10, pets: 10, movies: 10 });
      });

      it('should count with a limit', done => {
        const builder = buildFilter(Person);
        const query = builder.build({ limit: 1 });
        const countQuery = builder.count();

        query
          .then(result => {
            result.length.should.equal(1);
            return countQuery;
          })
          .then(count => {
            count.should.equal(10);
            done()
          })
          .catch(done);
      });

      it('should count with an offset and limit', done => {
        const builder = buildFilter(Person);
        const query = builder.build({ limit: 1, offset: 1 });
        const countQuery = builder.count();

        query
          .then(result => {
            result.length.should.equal(1);
            return countQuery;
          })
          .then(count => {
            count.should.equal(10);
            done()
          })
          .catch(done);
      });

      it('should count with a where clause', done => {
        const builder = buildFilter(Person);
        const query = builder.build({ where: { firstName: { $in: ['F00', 'F01'] } } });
        const countQuery = builder.count();

        query
          .then(result => {
            result.length.should.equal(2);
            return countQuery;
          })
          .then(count => {
            count.should.equal(2);
            done()
          })
          .catch(done);
      });

      it('should count with a require clause', done => {
        const builder = buildFilter(Person);
        const query = builder.build({
          require: {
            'movies.name': { $in: ['M09'] }
          }
        });
        const countQuery = builder.count();

        query
          .then(result => {
            result.length.should.equal(1);
            return countQuery;
          })
          .then(count => {
            count.should.equal(1);
            done()
          })
          .catch(done);
      });

      it('should count with a where clause and limit', done => {
        const builder = buildFilter(Person);
        const query = builder.build({
          where: { firstName: { $in: ['F00', 'F01', 'F02'] } },
          limit: 1
        });
        const countQuery = builder.count();

        query
          .then(result => {
            result.length.should.equal(1);
            return countQuery;
          })
          .then(count => {
            count.should.equal(3);
            done()
          })
          .catch(done);
      });

      it('should count with a require clause and limit', done => {
        const builder = buildFilter(Person);
        const query = builder.build({
          require: {
            'movies.name': { $in: ['M00', 'M10'] }
          },
          limit: 1
        });
        const countQuery = builder.count();

        query
          .then(result => {
            result.length.should.equal(1);
            return countQuery;
          })
          .then(count => {
            count.should.equal(2);
            done()
          })
          .catch(done);
      });

      it('should count with an eager expression and limit', done => {
        const builder = buildFilter(Person);
        const query = builder.build({ limit: 2, eager: 'movies' });
        const countQuery = builder.count();

        query
          .then(result => {
            result.length.should.equal(2);
            return countQuery;
          })
          .then(count => {
            count.should.equal(10);
            done()
          })
          .catch(done);
      });
    });
  });
});