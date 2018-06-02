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

        it('should filter based on $or with object', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': {
                  'movies.name': 'M00',
                  'movies.code': 'C08'
                }
              }
            })
            .then(result => {
              result.length.should.equal(2);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F08', 'F09']);
              done();
            })
            .catch(done);
        });

        it('should filter with $or before and after property name', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': [
                  {
                    'movies.name': {
                      '$or': [
                        { '$equals': 'M00' },
                        { '$equals': 'M10' }
                      ]
                    }
                  },
                  {
                    'movies.name': {
                      '$or': [
                        { '$equals': 'M20' },
                        { '$equals': 'M30' }
                      ]
                    }
                  }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(4);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09', 'F08', 'F07', 'F06']);
              done();
            })
            .catch(done);
        })
      });

      describe('require using $and', function() {
        it('should filter based on top level $and', done => {
          buildFilter(Person)
            .build({
              require: {
                '$and': [
                  { 'movies.name': 'M00' },
                  { 'movies.code': 'C09' }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09']);
              done();
            })
            .catch(done);
        });

        it('should filter based on nested $and', done => {
          buildFilter(Person)
            .build({
              require: {
                '$and': [
                  { 'movies.name': 'M00' },
                  { '$and': [
                    { 'movies.code': 'C09' }
                  ] }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09']);
              done();
            })
            .catch(done);
        });

        it('should filter based on $and with object', done => {
          buildFilter(Person)
            .build({
              require: {
                '$and': {
                  'movies.name': 'M00',
                  'movies.code': 'C09'
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09']);
              done();
            })
            .catch(done);
        });
      });

      describe('error conditions', function() {
        const validationError = new Error('should have thrown an error');

        it('should throw an error on initial operator', done => {
          buildFilter(Person)
            .build({
              require: {
                '$gt': 1
              }
            })
            .then(() => done(validationError))
            .catch(err => done());
        });

        it('should throw an error on early literal', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': [ 'invalid' ]
              }
            })
            .then(() => done(validationError))
            .catch(err => done());
        });

        it('should throw an error on early operator', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': [{ '$gt': 1 }]
              }
            })
            .then(() => done(validationError))
            .catch(err => done());
        });
      });
    });
  });
});