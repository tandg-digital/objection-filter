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