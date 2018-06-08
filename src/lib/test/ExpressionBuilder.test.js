'use strict';

const _ = require('lodash');
require('chai').should();
const expect = require('chai').expect;
const {
  createRelationExpression
} = require('../ExpressionBuilder');

describe('utilities and helpers', function () {
  describe('createRelationExpression', () => {
    it('should return undefined with no fields', () => {
      expect(
        createRelationExpression([])
      ).to.be.undefined;
    });

    it('should return undefined with only base fields', () => {
      expect(
        createRelationExpression([
          'id'
        ])
      ).to.be.undefined;
    });

    it('should create a single level expression with 1 field', () => {
      createRelationExpression([
        'relatedModel.id'
      ]).should.equal('relatedModel');
    });

    it('should create a single level expression with multiple fields', () => {
      createRelationExpression([
        'relatedModel.id',
        'anotherRelatedModel.id'
      ]).should.equal('[relatedModel,anotherRelatedModel]');
    });

    it('should create a 2-level expression with 1 field', () => {
      createRelationExpression([
        'relatedModelA.relatedModelA1.id',
      ]).should.equal('relatedModelA.relatedModelA1');
    });

    it('should create a 2-level expression with 2 fields with the same first relation', () => {
      createRelationExpression([
        'relatedModelA.relatedModelA1.id',
        'relatedModelA.relatedModelA2.id'
      ]).should.equal('relatedModelA.[relatedModelA1,relatedModelA2]');
    });

    it('should create a 2-level expression with mixed fields', () => {
      createRelationExpression([
        'relatedModelA.relatedModelA1.id',
        'relatedModelA.relatedModelA2.id',
        'relatedModelB.name'
      ]).should.equal(
        '[relatedModelA.[relatedModelA1,relatedModelA2],relatedModelB]'
      );

      createRelationExpression([
        'relatedModelA.relatedModelA1.id',
        'relatedModelA.relatedModelA2.id',
        'relatedModelB.relatedModelB1.id',
        'relatedModelB.relatedModelB2.id',
      ]).should.equal(
        '[relatedModelA.[relatedModelA1,relatedModelA2],relatedModelB.[relatedModelB1,relatedModelB2]]'
      );
    });
  });
});