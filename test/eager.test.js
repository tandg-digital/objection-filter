'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('eager object notation', function () {

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

      before(function () {
        return testUtils.insertData(session, {persons: 10, pets: 10, movies: 10});
      });

      describe('$filter on root model', function() {

      });

      describe('$filter on eager models', function() {
        it('should filter using a single condition', done => {
          buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $filter: {
                    name: 'M99'
                  }
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.map(result, 'movies')
                ), 'name'
              ).should.deep.equal(['M99']);
              done();
            })
            .catch(done);
        });

        it('should filter using a nested condition', done => {
          buildFilter(Person)
            .build({
              eager: {
                parent: {
                  movies: {
                    $filter: {
                      name: 'M99'
                    }
                  }
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.filter(_.map(result, 'parent.movies'), _.identity)
                ), 'name'
              ).should.deep.equal(['M99']);
              done();
            })
            .catch(done);
        });
      });
    });
  });
});