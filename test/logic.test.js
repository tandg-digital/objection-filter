'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('logical expression filters', function () {

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

      describe('require using $or', function() {
        it('should filter based on top level $or', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                '$or': [
                  { 'movies.name': 'M00' },
                  { 'movies.name': 'M10' }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(2);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09', 'F08']);
              done();
            })
            .catch(done);
        });

        it('should filter based on nested $or', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                '$or': [
                  { 'movies.name': 'M00' },
                  { '$or': [
                    { 'movies.name': 'M10' },
                    { 'movies.name': 'M20' },
                  ] }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(3);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09', 'F08', 'F07']);
              done();
            })
            .catch(done);
        });
      });
    });
  });
});